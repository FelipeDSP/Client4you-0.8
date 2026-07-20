"""Testes do enrichment_worker — fila assíncrona de enrichment (PR 5).

Não toca em Supabase real: usa FakeSupabase com tabelas em memória + um
EmailEnrichmentOrchestrator com providers stub.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Optional
from types import SimpleNamespace

import pytest

import enrichment_worker
from enrichment_worker import process_batch
from services.email_enrichment import (
    EmailEnrichmentOrchestrator,
    InMemoryDomainEmailCache,
)
from services.email_providers.base import EmailProvider, EmailResult


# ─── Stub provider ──────────────────────────────────────────────────────────


class _StubProvider(EmailProvider):
    def __init__(self, name: str, result: Optional[EmailResult] = None, raises: bool = False):
        self.name = name
        self.cost_per_call = result.cost_usd if result else 0.0
        self._result = result
        self._raises = raises

    async def find_email(self, lead: dict) -> Optional[EmailResult]:
        if self._raises:
            raise RuntimeError(f"{self.name} exploded")
        return self._result


# ─── FakeSupabase com 4 tabelas em memória ──────────────────────────────────


class _FakeSupabase:
    """Wrapper minimalista do supabase-py: suporta select/update/insert/eq + RPC.

    Tabelas suportadas: enrichment_jobs, leads, user_quotas, domain_email_cache.
    Tudo em dict; sem SQL real, sem RLS, sem triggers.

    RPC suportada: `increment_quota_atomic` (migration v14). Aplica o
    incremento direto na tabela `user_quotas` em memória — simula o
    comportamento atômico do Postgres real. Testes que querem exercitar o
    fallback read-then-write podem instanciar com `rpc_enabled=False`.
    """

    def __init__(
        self,
        tables: Optional[dict[str, list[dict]]] = None,
        rpc_enabled: bool = True,
    ):
        self.tables = tables or {
            "enrichment_jobs": [],
            "leads": [],
            "user_quotas": [],
            "domain_email_cache": [],
        }
        self.rpc_enabled = rpc_enabled

    def table(self, name: str):
        if name not in self.tables:
            self.tables[name] = []
        return _FakeQuery(self, name)

    def rpc(self, name: str, params: dict):
        return _FakeRpc(self, name, params)


class _FakeRpc:
    def __init__(self, parent: _FakeSupabase, name: str, params: dict):
        self._p = parent
        self._name = name
        self._params = params

    def execute(self):
        if not self._p.rpc_enabled:
            raise RuntimeError("RPC disabled in this fake")
        if self._name == "increment_quota_atomic":
            user_id = self._params["p_user_id"]
            field = self._params["p_field"]
            amount = self._params["p_amount"]
            # Whitelist mínima — espelha a função SQL pra detectar typo em teste
            valid = {
                "leads_used", "campaigns_used", "messages_sent",
                "emails_enriched_used", "cache_hits_count",
                "firecrawl_credits_spent_estimated", "reenrich_used",
            }
            if field not in valid:
                raise ValueError(f"increment_quota_atomic: campo invalido {field}")
            for row in self._p.tables["user_quotas"]:
                if row.get("user_id") == user_id:
                    row[field] = (row.get(field) or 0) + amount
                    break
            return SimpleNamespace(data=None)
        raise NotImplementedError(f"FakeRpc: {self._name}")


class _FakeQuery:
    def __init__(self, parent: _FakeSupabase, table_name: str):
        self._p = parent
        self._table = table_name
        self._filters: list[tuple[str, Any]] = []
        self._in_filter: Optional[tuple[str, list]] = None
        self._op: Optional[str] = None
        self._payload: Any = None
        self._select_cols: Optional[str] = None
        self._limit: Optional[int] = None
        self._order: Optional[str] = None

    def select(self, cols="*", **_kw):
        self._op = "select"
        self._select_cols = cols
        return self

    def insert(self, payload, **_kw):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload, **_kw):
        self._op = "update"
        self._payload = payload
        return self

    def upsert(self, payload, **_kw):
        self._op = "upsert"
        self._payload = payload
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def in_(self, col, vals):
        self._in_filter = (col, list(vals))
        return self

    def order(self, col, **_kw):
        self._order = col
        return self

    def limit(self, n):
        self._limit = n
        return self

    def maybe_single(self):
        self._limit = 1
        return self

    def _row_matches(self, row: dict) -> bool:
        for col, val in self._filters:
            if row.get(col) != val:
                return False
        if self._in_filter is not None:
            col, vals = self._in_filter
            if row.get(col) not in vals:
                return False
        return True

    def execute(self):
        rows = self._p.tables[self._table]

        if self._op == "select":
            matched = [r for r in rows if self._row_matches(r)]
            if self._order:
                matched = sorted(matched, key=lambda r: r.get(self._order) or "")
            if self._limit:
                matched = matched[: self._limit]
            return SimpleNamespace(data=deepcopy(matched), count=len(matched))

        if self._op == "insert":
            new_rows = self._payload if isinstance(self._payload, list) else [self._payload]
            for r in new_rows:
                rows.append(deepcopy(r))
            return SimpleNamespace(data=deepcopy(new_rows))

        if self._op == "update":
            updated = []
            for r in rows:
                if self._row_matches(r):
                    r.update(self._payload)
                    updated.append(r)
            return SimpleNamespace(data=deepcopy(updated))

        if self._op == "upsert":
            # Não implementado — testes do worker não usam upsert
            return SimpleNamespace(data=[])

        raise NotImplementedError(self._op)


# ─── Fixtures ───────────────────────────────────────────────────────────────


def _mk_orchestrator(providers):
    cache = InMemoryDomainEmailCache()
    return EmailEnrichmentOrchestrator(cache=cache, providers=providers)


def _seed_batch(
    sb: _FakeSupabase,
    batch_id: str,
    company_id: str,
    user_id: str,
    leads: list[dict],
) -> None:
    """Insere leads + 1 enrichment_job pending por lead. Também cria user_quotas."""
    for lead in leads:
        sb.tables["leads"].append(deepcopy(lead))
        sb.tables["enrichment_jobs"].append({
            "id": f"job-{lead['id']}",
            "batch_id": batch_id,
            "lead_id": lead["id"],
            "company_id": company_id,
            "user_id": user_id,
            "status": "pending",
            "created_at": "2026-05-28T12:00:00Z",
        })
    sb.tables["user_quotas"].append({
        "user_id": user_id,
        "emails_enriched_used": 0,
        "firecrawl_credits_spent_estimated": 0.0,
        "cache_hits_count": 0,
    })


@pytest.fixture(autouse=True)
def _clear_running_batches():
    enrichment_worker._running_batches.clear()
    yield
    enrichment_worker._running_batches.clear()


# ─── process_batch — happy path ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_process_batch_happy_path_all_completed():
    sb = _FakeSupabase()
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": None},
        {"id": "L2", "company_id": "c1", "website": "https://b.com.br", "cnpj": None},
    ])
    p = _StubProvider("firecrawl_search", EmailResult(
        email="ok@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.02,
    ))
    orch = _mk_orchestrator([p])

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)

    jobs = sb.tables["enrichment_jobs"]
    assert all(j["status"] == "completed" for j in jobs)
    assert all(j["result_email"] == "ok@empresa.com.br" for j in jobs)
    # Lead foi atualizado com email + has_email
    leads = sb.tables["leads"]
    assert all(l["email"] == "ok@empresa.com.br" for l in leads)
    assert all(l["has_email"] is True for l in leads)
    # Telemetria: 2 processados, cost 0.04 (cache miss em ambos), 0 cache hits
    quota = sb.tables["user_quotas"][0]
    assert quota["emails_enriched_used"] == 2
    assert abs(quota["firecrawl_credits_spent_estimated"] - 0.04) < 1e-9
    assert quota["cache_hits_count"] == 0


@pytest.mark.asyncio
async def test_process_batch_persists_extracted_cnpj_when_not_set():
    sb = _FakeSupabase()
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": None},
    ])
    p = _StubProvider("firecrawl_search", EmailResult(
        email="ok@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.02,
        extracted_cnpjs=["11222333000181"],
    ))
    orch = _mk_orchestrator([p])

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)

    assert sb.tables["leads"][0]["cnpj"] == "11222333000181"


@pytest.mark.asyncio
async def test_process_batch_does_not_overwrite_existing_cnpj():
    sb = _FakeSupabase()
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": "99999999000191"},
    ])
    p = _StubProvider("firecrawl_search", EmailResult(
        email="ok@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.02,
        extracted_cnpjs=["11222333000181"],  # diferente do existente
    ))
    orch = _mk_orchestrator([p])

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)

    # CNPJ existente preservado
    assert sb.tables["leads"][0]["cnpj"] == "99999999000191"


# ─── process_batch — falhas ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_process_batch_orchestrator_raises_marks_failed():
    sb = _FakeSupabase()
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": None},
    ])
    p = _StubProvider("broken", raises=True)
    orch = _mk_orchestrator([p])

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)

    # Orchestrator captura exceção dos providers, então acaba retornando
    # um result válido (email=None) — job vira completed, NÃO failed.
    # Confirma esse comportamento: orchestrator não propaga exceção.
    job = sb.tables["enrichment_jobs"][0]
    assert job["status"] == "completed"
    assert job["result_email"] is None


@pytest.mark.asyncio
async def test_process_batch_lead_missing_marks_failed():
    """Lead apagado entre INSERT do job e process_batch → job failed."""
    sb = _FakeSupabase()
    # NÃO faz seed de leads — só do job
    sb.tables["enrichment_jobs"].append({
        "id": "job-orphan",
        "batch_id": "b1",
        "lead_id": "L-gone",
        "company_id": "c1",
        "user_id": "u1",
        "status": "pending",
        "created_at": "2026-05-28T12:00:00Z",
    })
    sb.tables["user_quotas"].append({
        "user_id": "u1",
        "emails_enriched_used": 0,
        "firecrawl_credits_spent_estimated": 0.0,
        "cache_hits_count": 0,
    })
    orch = _mk_orchestrator([_StubProvider("never", None)])

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)

    job = sb.tables["enrichment_jobs"][0]
    assert job["status"] == "failed"
    assert "não encontrado" in (job.get("error") or "")


# ─── process_batch — dedup e idempotência ───────────────────────────────────


@pytest.mark.asyncio
async def test_process_batch_dedup_in_memory(monkeypatch):
    """Se _running_batches já tem o batch_id, nova chamada é no-op."""
    sb = _FakeSupabase()
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": None},
    ])
    orch = _mk_orchestrator([_StubProvider("p", EmailResult(
        email="x@y.com", source="p", confidence=0.9, cost_usd=0.0,
    ))])

    enrichment_worker._running_batches.add("b1")  # simula outra execução em curso
    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)

    # Job ainda pending — segunda chamada foi ignorada
    assert sb.tables["enrichment_jobs"][0]["status"] == "pending"


@pytest.mark.asyncio
async def test_process_batch_idempotent_only_processes_pending():
    """Re-chamada de batch já processado não duplica nada."""
    sb = _FakeSupabase()
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": None},
    ])
    p = _StubProvider("p", EmailResult(
        email="x@y.com", source="p", confidence=0.9, cost_usd=0.02,
    ))
    orch = _mk_orchestrator([p])

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)
    quota_after_first = deepcopy(sb.tables["user_quotas"][0])

    # Segunda chamada: sem pending, nada a fazer
    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)
    quota_after_second = sb.tables["user_quotas"][0]

    assert quota_after_first == quota_after_second  # quota não mexeu na 2ª


# ─── process_batch — multi-tenancy ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_process_batch_force_increments_reenrich_used():
    """force=True → reenrich_used sobe, emails_enriched_used permanece 0."""
    sb = _FakeSupabase()
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": None},
        {"id": "L2", "company_id": "c1", "website": "https://b.com.br", "cnpj": None},
    ])
    # Adiciona reenrich_used=0 manualmente (não está no _seed_batch ainda)
    sb.tables["user_quotas"][0]["reenrich_used"] = 0

    p = _StubProvider("firecrawl_search", EmailResult(
        email="ok@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.03,
    ))
    orch = _mk_orchestrator([p])

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch, force=True)

    quota = sb.tables["user_quotas"][0]
    assert quota["reenrich_used"] == 2  # 2 leads processados
    assert quota["emails_enriched_used"] == 0  # NÃO sobe a quota normal
    # firecrawl_credits_spent_estimated continua subindo (telemetria geral)
    assert abs(quota["firecrawl_credits_spent_estimated"] - 0.06) < 1e-9


@pytest.mark.asyncio
async def test_process_batch_force_bypasses_cache():
    """Com force=True, mesmo cache hit dispara cascata (cached=False sempre)."""
    sb = _FakeSupabase()
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": None},
    ])
    sb.tables["user_quotas"][0]["reenrich_used"] = 0

    # Pré-popula cache (sem reach desse fake, então faço pela InMemoryCache do orchestrator)
    p_called = []
    class _CallCounter(_StubProvider):
        async def find_email(self, lead):
            p_called.append(lead.get("id"))
            return await super().find_email(lead)

    p = _CallCounter("firecrawl_search", EmailResult(
        email="fresh@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.03,
    ))
    orch = _mk_orchestrator([p])
    # Pré-carrega cache do orchestrator com dado stale
    from datetime import datetime, timezone
    from services.email_enrichment.domain_cache import CacheEntry
    await orch._cache.upsert("a.com.br", CacheEntry(
        email="stale@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.0,
        scraped_at=datetime.now(timezone.utc),
    ))

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch, force=True)

    # Provider FOI chamado (cache foi bypassado)
    assert p_called == ["L1"]
    job = sb.tables["enrichment_jobs"][0]
    assert job["result_email"] == "fresh@empresa.com.br"
    assert job["result_cached"] is False


@pytest.mark.asyncio
async def test_process_batch_falls_back_when_rpc_missing():
    """Migration v14 ainda não aplicada → fallback read-then-write produz
    mesmo resultado final (mas log ERROR aparece). Garante que o deploy é
    seguro mesmo com janela onde código novo está rodando + migration pendente."""
    sb = _FakeSupabase(rpc_enabled=False)
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": None},
    ])
    sb.tables["user_quotas"][0]["reenrich_used"] = 0
    p = _StubProvider("firecrawl_search", EmailResult(
        email="ok@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.02,
    ))
    orch = _mk_orchestrator([p])

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)

    quota = sb.tables["user_quotas"][0]
    assert quota["emails_enriched_used"] == 1
    assert abs(quota["firecrawl_credits_spent_estimated"] - 0.02) < 1e-9


@pytest.mark.asyncio
async def test_process_batch_only_increments_cache_hits_when_positive():
    """cache_hits_count só sobe quando houve hits. firecrawl_credits só sobe
    quando custou. Evita RPC desnecessária (3 chamadas viram 1 ou 2)."""
    sb = _FakeSupabase()
    _seed_batch(sb, "b1", "c1", "u1", [
        {"id": "L1", "company_id": "c1", "website": "https://a.com.br", "cnpj": None},
    ])

    # Provider que devolve cache_hit virtual via orchestrator
    from datetime import datetime, timezone
    from services.email_enrichment.domain_cache import CacheEntry
    cache = InMemoryDomainEmailCache()
    await cache.upsert("a.com.br", CacheEntry(
        email="cached@a.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.0,
        scraped_at=datetime.now(timezone.utc),
    ))
    p = _StubProvider("never", None)
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p])

    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)

    quota = sb.tables["user_quotas"][0]
    assert quota["emails_enriched_used"] == 1
    assert quota["cache_hits_count"] == 1
    # cost_usd=0 (cache hit) → contador não é incrementado
    assert quota["firecrawl_credits_spent_estimated"] == 0.0


@pytest.mark.asyncio
async def test_process_batch_ignores_jobs_from_other_company():
    """company_id filtra: jobs de outras empresas não são tocados."""
    sb = _FakeSupabase()
    # Job de OUTRA company
    sb.tables["enrichment_jobs"].append({
        "id": "job-other",
        "batch_id": "b1",
        "lead_id": "L1",
        "company_id": "c2",  # outra
        "user_id": "u2",
        "status": "pending",
        "created_at": "2026-05-28T12:00:00Z",
    })
    sb.tables["leads"].append({"id": "L1", "company_id": "c2"})

    orch = _mk_orchestrator([_StubProvider("p", None)])
    await process_batch("b1", "c1", sb_client=sb, orchestrator=orch)

    # Job de outra company NÃO foi processado
    assert sb.tables["enrichment_jobs"][0]["status"] == "pending"
