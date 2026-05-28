"""Testes do EmailEnrichmentOrchestrator — cascata + cache.

Não toca em Supabase real: usa `InMemoryDomainEmailCache` e providers fake
que não fazem I/O. Foca em comportamento de cascata, early-stop, cache,
e dedup de CNPJs.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest

from services.email_enrichment.domain_cache import (
    CacheEntry,
    InMemoryDomainEmailCache,
)
from services.email_enrichment.orchestrator import (
    EmailEnrichmentOrchestrator,
    OrchestratorResult,
)
from services.email_providers.base import EmailProvider, EmailResult


# ─── Providers fake ─────────────────────────────────────────────────────────


class _StubProvider(EmailProvider):
    """Provider determinístico: retorna `result` quando chamado."""

    def __init__(self, name: str, result: Optional[EmailResult], raises: bool = False):
        self.name = name
        self.cost_per_call = result.cost_usd if result else 0.0
        self._result = result
        self._raises = raises
        self.call_count = 0

    async def find_email(self, lead: dict) -> Optional[EmailResult]:
        self.call_count += 1
        if self._raises:
            raise RuntimeError(f"{self.name} exploded")
        return self._result


def _mk_lead(**kw) -> dict:
    return {"id": "lead-1", "website": "https://empresa.com.br", **kw}


# ─── Cache hit/miss ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_hit_returns_direct_no_provider_calls():
    cache = InMemoryDomainEmailCache()
    await cache.upsert("empresa.com.br", CacheEntry(
        email="cached@empresa.com.br",
        source="firecrawl_search",
        confidence=0.9,
        cost_usd=0.02,
        scraped_at=datetime.now(timezone.utc),  # fresh
    ))

    p = _StubProvider("never_called", None)
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p])

    result = await orch.enrich(_mk_lead())
    assert result.email == "cached@empresa.com.br"
    assert result.cached is True
    assert result.cost_usd == 0.0  # cache hit nunca custa
    assert result.source == "firecrawl_search"  # preserva source original
    assert p.call_count == 0  # não chamou cascata


@pytest.mark.asyncio
async def test_cache_miss_runs_cascade_and_stores():
    cache = InMemoryDomainEmailCache()
    p = _StubProvider("firecrawl_search", EmailResult(
        email="achei@empresa.com.br",
        source="firecrawl_search",
        confidence=0.9,
        cost_usd=0.02,
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p])

    result = await orch.enrich(_mk_lead())
    assert result.email == "achei@empresa.com.br"
    assert result.cached is False
    assert result.cost_usd == 0.02
    assert p.call_count == 1

    # Próxima chamada vem do cache
    p2 = _StubProvider("never_called_2", None)
    orch2 = EmailEnrichmentOrchestrator(cache=cache, providers=[p2])
    result2 = await orch2.enrich(_mk_lead())
    assert result2.email == "achei@empresa.com.br"
    assert result2.cached is True
    assert p2.call_count == 0


@pytest.mark.asyncio
async def test_cache_expired_re_scrapes():
    """Entry > TTL → trata como miss, cascata roda novamente."""
    cache = InMemoryDomainEmailCache()
    # 40 dias atrás
    old = datetime.now(timezone.utc) - timedelta(days=40)
    await cache.upsert("empresa.com.br", CacheEntry(
        email="stale@empresa.com.br", source="firecrawl_search",
        confidence=0.8, cost_usd=0.0, scraped_at=old,
    ))

    p = _StubProvider("fresh_provider", EmailResult(
        email="novo@empresa.com.br", source="firecrawl_search",
        confidence=0.85, cost_usd=0.02,
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p], cache_ttl_days=30)

    result = await orch.enrich(_mk_lead())
    assert result.email == "novo@empresa.com.br"
    assert result.cached is False
    assert p.call_count == 1


# ─── Cascata: early stop / fallback ────────────────────────────────────────


@pytest.mark.asyncio
async def test_early_stops_at_high_confidence():
    """1º provider acha com confidence >= 0.8 → não chama os outros."""
    cache = InMemoryDomainEmailCache()
    p1 = _StubProvider("dataforseo_contact_url", EmailResult(
        email="high@empresa.com.br", source="dataforseo_contact_url",
        confidence=0.95, cost_usd=0.0,
    ))
    p2 = _StubProvider("firecrawl_search", EmailResult(
        email="never@empresa.com.br", source="firecrawl_search",
        confidence=0.5, cost_usd=0.02,
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p1, p2])

    result = await orch.enrich(_mk_lead())
    assert result.email == "high@empresa.com.br"
    assert p1.call_count == 1
    assert p2.call_count == 0


@pytest.mark.asyncio
async def test_continues_when_first_provider_low_confidence():
    """1º provider acha mas com confidence < 0.8 → continua cascata pra ver se acha melhor."""
    cache = InMemoryDomainEmailCache()
    p1 = _StubProvider("dataforseo_contact_url", EmailResult(
        email="low@empresa.com.br", source="dataforseo_contact_url",
        confidence=0.55, cost_usd=0.0,
    ))
    p2 = _StubProvider("firecrawl_search", EmailResult(
        email="high@empresa.com.br", source="firecrawl_search",
        confidence=0.92, cost_usd=0.02,
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p1, p2])

    result = await orch.enrich(_mk_lead())
    assert result.email == "high@empresa.com.br"  # melhor confidence vence
    assert result.cost_usd == 0.02
    assert p1.call_count == 1
    assert p2.call_count == 1


@pytest.mark.asyncio
async def test_all_providers_miss_caches_negative():
    """Todos providers rodam mas não acham → cache negativo + result vazio."""
    cache = InMemoryDomainEmailCache()
    p1 = _StubProvider("dataforseo_contact_url", EmailResult(
        email=None, source="dataforseo_contact_url", confidence=0.0, cost_usd=0.0,
    ))
    p2 = _StubProvider("firecrawl_search", EmailResult(
        email=None, source="firecrawl_search", confidence=0.0, cost_usd=0.02,
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p1, p2])

    result = await orch.enrich(_mk_lead())
    assert result.email is None
    assert result.cost_usd == 0.02  # acumula custo dos providers que rodaram

    # Cache negativo: próxima chamada NÃO re-roda providers
    p1.call_count = 0
    p2.call_count = 0
    result2 = await orch.enrich(_mk_lead())
    assert result2.cached is True
    assert result2.email is None
    assert p1.call_count == 0
    assert p2.call_count == 0


@pytest.mark.asyncio
async def test_provider_returning_none_skipped():
    """Provider None (não aplicável) é pulado sem custo nem efeito."""
    cache = InMemoryDomainEmailCache()
    p1 = _StubProvider("dataforseo_contact_url", None)  # devolve None
    p2 = _StubProvider("firecrawl_search", EmailResult(
        email="ok@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.02,
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p1, p2])

    result = await orch.enrich(_mk_lead())
    assert result.email == "ok@empresa.com.br"
    assert result.source == "firecrawl_search"


@pytest.mark.asyncio
async def test_provider_exception_swallowed():
    """Provider levanta → orchestrator pula e tenta próximo."""
    cache = InMemoryDomainEmailCache()
    p1 = _StubProvider("broken", None, raises=True)
    p2 = _StubProvider("firecrawl_search", EmailResult(
        email="ok@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.02,
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p1, p2])

    result = await orch.enrich(_mk_lead())
    assert result.email == "ok@empresa.com.br"
    assert p1.call_count == 1
    assert p2.call_count == 1


# ─── Casos de borda ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_no_website_no_domain_short_circuits():
    """Sem website nem domain → result vazio, cache nem consultado."""
    cache = InMemoryDomainEmailCache()
    p = _StubProvider("never", None)
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p])

    result = await orch.enrich({"id": "lead-1"})
    assert result.email is None
    assert result.cached is False
    assert result.cost_usd == 0.0
    assert p.call_count == 0


@pytest.mark.asyncio
async def test_uses_domain_field_when_no_website():
    """Lead sem `website` mas com `domain` → orchestrator usa domain."""
    cache = InMemoryDomainEmailCache()
    p = _StubProvider("firecrawl_search", EmailResult(
        email="ok@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.02,
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p])

    result = await orch.enrich({"id": "lead-1", "domain": "empresa.com.br"})
    assert result.email == "ok@empresa.com.br"
    # E foi cacheado pelo mesmo domínio
    cached = await cache.lookup("empresa.com.br")
    assert cached is not None
    assert cached.email == "ok@empresa.com.br"


@pytest.mark.asyncio
async def test_extracted_cnpjs_deduplicated_across_providers():
    """Mesmo CNPJ achado por 2 providers → aparece 1x no resultado."""
    cache = InMemoryDomainEmailCache()
    p1 = _StubProvider("dataforseo_contact_url", EmailResult(
        email=None, source="dataforseo_contact_url",
        confidence=0.0, cost_usd=0.0,
        extracted_cnpjs=["11222333000181"],
    ))
    p2 = _StubProvider("firecrawl_search", EmailResult(
        email="ok@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.02,
        extracted_cnpjs=["11222333000181", "33000167000101"],
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p1, p2])

    result = await orch.enrich(_mk_lead())
    assert result.extracted_cnpjs == ["11222333000181", "33000167000101"]


@pytest.mark.asyncio
async def test_cache_hit_does_not_carry_cnpjs():
    """Cache só armazena email — CNPJs ficam por conta da próxima cascata real."""
    cache = InMemoryDomainEmailCache()
    await cache.upsert("empresa.com.br", CacheEntry(
        email="cached@empresa.com.br", source="firecrawl_search",
        confidence=0.9, cost_usd=0.0,
        scraped_at=datetime.now(timezone.utc),
    ))
    p = _StubProvider("never", None)
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p])

    result = await orch.enrich(_mk_lead())
    assert result.extracted_cnpjs == []


@pytest.mark.asyncio
async def test_orchestrator_result_lead_id_preserved():
    cache = InMemoryDomainEmailCache()
    p = _StubProvider("p", EmailResult(
        email=None, source="p", confidence=0.0, cost_usd=0.0,
    ))
    orch = EmailEnrichmentOrchestrator(cache=cache, providers=[p])

    result = await orch.enrich({"id": "abc-123", "website": "https://x.com"})
    assert result.lead_id == "abc-123"
