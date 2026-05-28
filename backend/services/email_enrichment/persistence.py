"""Persistência compartilhada entre endpoint síncrono e worker assíncrono.

Tanto o `POST /enrich-emails` (síncrono) quanto o `enrichment_worker.process_batch`
(assíncrono) precisam:
  1. Atualizar `leads` com email/source/confidence/CNPJ
  2. Incrementar contadores em `user_quotas`

Antes vivia inline em `routes/leads.py`. Extraído pra evitar duplicação no PR 5.
"""
from __future__ import annotations

import logging
from typing import Optional

from .orchestrator import OrchestratorResult

logger = logging.getLogger(__name__)


def persist_lead_enrichment(
    sb_client,
    lead_id: str,
    company_id: str,
    result: OrchestratorResult,
    now_iso: str,
    lead_cnpj_already_set: bool,
) -> None:
    """Aplica result do orchestrator no lead.

    Idempotente: atualizar 2x com o mesmo result não causa drift (só
    re-escreve os mesmos valores).

    `lead_cnpj_already_set`: se True, NÃO sobrescreve cnpj (assume que o
    valor manual ou anterior é mais confiável que o extraído por scrape).
    """
    updates: dict = {
        "last_enrichment_attempted_at": now_iso,
        "enrichment_source": result.source,
        "enrichment_confidence": result.confidence if result.confidence > 0 else None,
    }
    if result.email:
        updates["email"] = result.email
        updates["has_email"] = True
    if not lead_cnpj_already_set and result.extracted_cnpjs:
        updates["cnpj"] = result.extracted_cnpjs[0]

    try:
        sb_client.table("leads").update(updates) \
            .eq("id", lead_id) \
            .eq("company_id", company_id) \
            .execute()
    except Exception as e:
        logger.error(
            f"persist_lead_enrichment falhou lead={lead_id}: "
            f"{type(e).__name__}: {e}"
        )
        raise


def increment_enrichment_telemetry(
    sb_client,
    user_id: Optional[str],
    processed: int,
    total_cost: float,
    cache_hits: int,
) -> None:
    """Soma contadores em `user_quotas`. Best-effort — falha NÃO interrompe.

    PR 4 introduziu os 3 contadores. PR 5 mantém a mesma semântica.
    Bloqueio por limite mensal + 402 ainda fica pro PR 6 (TECH_DEBT.md#6).
    """
    if not user_id:
        return
    try:
        resp = (
            sb_client.table("user_quotas")
            .select("emails_enriched_used,firecrawl_credits_spent_estimated,cache_hits_count")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            logger.warning(f"telemetria enrichment: user_quota ausente user_id={user_id}")
            return
        row = rows[0]
        sb_client.table("user_quotas").update({
            "emails_enriched_used": (row.get("emails_enriched_used") or 0) + processed,
            "firecrawl_credits_spent_estimated": (
                float(row.get("firecrawl_credits_spent_estimated") or 0) + total_cost
            ),
            "cache_hits_count": (row.get("cache_hits_count") or 0) + cache_hits,
        }).eq("user_id", user_id).execute()
    except Exception as e:
        logger.warning(
            f"telemetria enrichment falhou (não-fatal): {type(e).__name__}: {e}"
        )
