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


def _rpc_increment(sb_client, user_id: str, field: str, amount) -> bool:
    """Helper local — dispara o mesmo RPC `increment_quota_atomic` da migration v14.

    Mantido aqui pra evitar dependência circular com `supabase_service` (que
    importaria persistence em alguns lugares). Mesmo contrato: tenta RPC,
    cai em read-then-write se RPC ausente, loga ERROR no fallback.
    """
    try:
        sb_client.rpc('increment_quota_atomic', {
            'p_user_id': user_id,
            'p_field': field,
            'p_amount': amount,
        }).execute()
        return True
    except Exception as rpc_err:
        logger.error(
            f"RPC increment_quota_atomic falhou em {field} ({rpc_err}) — fallback "
            f"NÃO-ATÔMICO. Aplique docs/migration_v14_quota_atomic.sql."
        )
        try:
            resp = (
                sb_client.table("user_quotas")
                .select(field)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                return False
            current = rows[0].get(field) or 0
            sb_client.table("user_quotas").update({
                field: current + amount,
            }).eq("user_id", user_id).execute()
            return True
        except Exception as e:
            logger.error(f"Fallback increment {field} também falhou: {e}")
            return False


def increment_enrichment_telemetry(
    sb_client,
    user_id: Optional[str],
    processed: int,
    total_cost: float,
    cache_hits: int,
    reenrich: bool = False,
) -> None:
    """Soma contadores em `user_quotas` via RPC atômico (migration v14).

    Quando `reenrich=True`, incrementa `reenrich_used` em vez de
    `emails_enriched_used` (sub-quota separada do botão "Reenriquecer", PR 6).
    Reenrichment força bypass cache → `cache_hits_count` não sobe nessa rota.
    `firecrawl_credits_spent_estimated` continua subindo (telemetria geral).

    Best-effort — falha em incrementos individuais NÃO interrompe o batch
    (orchestrator já rodou e cobrou Firecrawl). Cada campo é uma RPC separada;
    erro em 1 não bloqueia os outros.
    """
    if not user_id or processed <= 0:
        return

    quota_field = "reenrich_used" if reenrich else "emails_enriched_used"
    _rpc_increment(sb_client, user_id, quota_field, processed)

    if total_cost > 0:
        _rpc_increment(sb_client, user_id, "firecrawl_credits_spent_estimated", total_cost)

    if not reenrich and cache_hits > 0:
        _rpc_increment(sb_client, user_id, "cache_hits_count", cache_hits)
