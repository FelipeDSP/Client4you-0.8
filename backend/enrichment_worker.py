"""Async worker que processa um batch de jobs de enrichment.

Espelha o padrão de `email_worker.py`:
- single-process via FastAPI BackgroundTasks
- dedup in-memory por `_running_batches`
- limites conhecidos em `docs/TECH_DEBT.md#3` (multi-worker uvicorn fura)

Se o uvicorn reiniciar no meio de um batch, jobs ficam em status='pending'
ou 'processing' (esses últimos órfãos). Re-disparar o batch via novo POST
processa só os pendentes — ver `process_batch` (toma `WHERE status='pending'`).
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from helpers import get_db
from services.email_enrichment import (
    EmailEnrichmentOrchestrator,
    SupabaseDomainEmailCache,
    increment_enrichment_telemetry,
    persist_lead_enrichment,
)

logger = logging.getLogger(__name__)

# Dedup in-memory. NÃO funciona em multi-worker uvicorn (TECH_DEBT.md#3).
_running_batches: set[str] = set()


def _cache_ttl_days() -> int:
    """TTL do domain_email_cache, configurável por env (default 30d)."""
    try:
        return int(os.getenv("EMAIL_CACHE_TTL_DAYS", "30"))
    except (TypeError, ValueError):
        return 30


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _process_one_job(
    db_client,
    orchestrator: EmailEnrichmentOrchestrator,
    job: dict,
) -> tuple[bool, float, bool]:
    """Processa 1 job. Retorna (ok, cost_usd, cache_hit).

    ok=False quando orchestrator levantou exceção OU o lead sumiu/é de outra
    company. Worker continua pra próximo job.
    """
    job_id = job["id"]
    lead_id = job["lead_id"]
    company_id = job["company_id"]
    user_id = job.get("user_id")

    # Marca processing pra evitar reprocessamento se outra request disparar
    db_client.table("enrichment_jobs").update({
        "status": "processing",
        "started_at": _now_iso(),
        "updated_at": _now_iso(),
    }).eq("id", job_id).execute()

    # Carrega lead pra ter website/contact_url/cnpj atuais (pode ter sido
    # editado entre o INSERT do job e agora)
    lead_resp = (
        db_client.table("leads")
        .select("id, website, contact_url, cnpj")
        .eq("id", lead_id)
        .eq("company_id", company_id)
        .limit(1)
        .execute()
    )
    leads = lead_resp.data or []
    if not leads:
        db_client.table("enrichment_jobs").update({
            "status": "failed",
            "error": "lead não encontrado ou não pertence à company",
            "completed_at": _now_iso(),
            "updated_at": _now_iso(),
        }).eq("id", job_id).execute()
        return False, 0.0, False

    lead = leads[0]

    try:
        result = await orchestrator.enrich(lead)
    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        logger.error(f"[enrichment_worker] orchestrator falhou job={job_id} lead={lead_id}: {msg}")
        db_client.table("enrichment_jobs").update({
            "status": "failed",
            "error": msg[:500],
            "completed_at": _now_iso(),
            "updated_at": _now_iso(),
        }).eq("id", job_id).execute()
        return False, 0.0, False

    try:
        persist_lead_enrichment(
            db_client, lead_id, company_id, result, _now_iso(),
            lead_cnpj_already_set=bool(lead.get("cnpj")),
        )
    except Exception as e:
        # persistência falhou mas orchestrator rodou — registra erro mas
        # contabiliza custo (já gastou Firecrawl)
        msg = f"persist falhou: {type(e).__name__}: {e}"
        logger.error(f"[enrichment_worker] {msg} job={job_id}")
        db_client.table("enrichment_jobs").update({
            "status": "failed",
            "error": msg[:500],
            "result_cost_usd": result.cost_usd,
            "result_cached": result.cached,
            "completed_at": _now_iso(),
            "updated_at": _now_iso(),
        }).eq("id", job_id).execute()
        return False, result.cost_usd, result.cached

    db_client.table("enrichment_jobs").update({
        "status": "completed",
        "result_email": result.email,
        "result_source": result.source,
        "result_confidence": result.confidence if result.confidence > 0 else None,
        "result_cached": result.cached,
        "result_cost_usd": result.cost_usd,
        "result_extracted_cnpjs": result.extracted_cnpjs or None,
        "completed_at": _now_iso(),
        "updated_at": _now_iso(),
    }).eq("id", job_id).execute()

    return True, result.cost_usd, result.cached


async def process_batch(
    batch_id: str,
    company_id: str,
    sb_client=None,
    orchestrator: Optional[EmailEnrichmentOrchestrator] = None,
) -> None:
    """Loop principal: processa todos os jobs pendentes do batch.

    Idempotente: pode ser chamado várias vezes pro mesmo batch — só pega
    `WHERE status='pending'`, então re-chamada sem pendentes vira no-op.
    Dedup in-memory evita 2 workers paralelos no mesmo batch dentro do
    mesmo processo uvicorn.

    Args:
        batch_id, company_id: identificação do batch (multi-tenant).
        sb_client: Supabase client (default: get_db().client). Injetável pra testes.
        orchestrator: orquestrador a usar. Default: Supabase cache + providers
            reais. Pra testes, passar um com InMemoryDomainEmailCache + providers fake.
    """
    if batch_id in _running_batches:
        logger.warning(f"[enrichment_worker] batch {batch_id} já em execução; ignorando")
        return
    _running_batches.add(batch_id)

    try:
        sb = sb_client if sb_client is not None else get_db().client

        if orchestrator is None:
            cache = SupabaseDomainEmailCache(sb)
            orchestrator = EmailEnrichmentOrchestrator(
                cache=cache, cache_ttl_days=_cache_ttl_days(),
            )

        processed = 0
        total_cost = 0.0
        cache_hits = 0
        first_user_id: Optional[str] = None

        while True:
            pending_resp = (
                sb.table("enrichment_jobs")
                .select("id, lead_id, company_id, user_id")
                .eq("batch_id", batch_id)
                .eq("company_id", company_id)
                .eq("status", "pending")
                .order("created_at")
                .limit(1)
                .execute()
            )
            jobs = pending_resp.data or []
            if not jobs:
                break  # batch finalizado

            job = jobs[0]
            if first_user_id is None:
                first_user_id = job.get("user_id")

            ok, cost, cached = await _process_one_job(sb, orchestrator, job)
            processed += 1
            total_cost += cost
            if cached:
                cache_hits += 1

            # Yield control pra evitar starvation de outras tasks do uvicorn
            # com muitos jobs no batch
            await asyncio.sleep(0)

        if processed > 0:
            increment_enrichment_telemetry(
                sb, first_user_id, processed, total_cost, cache_hits,
            )

        logger.info(
            f"[enrichment_worker] batch {batch_id} finalizado: "
            f"processed={processed} cost=${total_cost:.4f} cache_hits={cache_hits}"
        )

    except Exception as e:
        logger.error(
            f"[enrichment_worker] erro inesperado batch={batch_id}: {e}",
            exc_info=True,
        )
    finally:
        _running_batches.discard(batch_id)
