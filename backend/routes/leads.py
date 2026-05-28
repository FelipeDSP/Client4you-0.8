import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request, Depends, HTTPException, BackgroundTasks
from security_utils import get_authenticated_user, handle_error
from helpers import get_db
from dataforseo_service import search_google_maps, DataForSEOError, MAX_DEPTH
from services.cnpj_utils import normalize_cnpj
from services.email_enrichment import (
    EmailEnrichmentOrchestrator,
    SupabaseDomainEmailCache,
    increment_enrichment_telemetry,
    persist_lead_enrichment,
)
from enrichment_worker import process_batch


def _cache_ttl_days() -> int:
    """TTL do domain_email_cache, configurável por env (default 30d)."""
    try:
        return int(os.getenv("EMAIL_CACHE_TTL_DAYS", "30"))
    except (TypeError, ValueError):
        return 30

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/leads", tags=["leads"])


class EnrichEmailsRequest(BaseModel):
    lead_ids: List[str]


class SearchLeadsRequest(BaseModel):
    query: str
    location: str
    search_id: Optional[str] = None
    limit: Optional[int] = None  # quantos leads o usuário quer (None = até o teto)


def _map_lead(row: dict) -> dict:
    """Mapeia uma linha da tabela `leads` para o shape esperado pelo frontend (TS Lead)."""
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "phone": row.get("phone") or "",
        "hasWhatsApp": row.get("has_whatsapp") or False,
        "email": row.get("email"),
        "hasEmail": row.get("has_email") or False,
        "address": row.get("address") or "",
        "city": "",
        "state": "",
        "rating": float(row.get("rating")) if row.get("rating") is not None else 0,
        "reviews": row.get("reviews_count") or 0,
        "category": row.get("category") or "",
        "website": row.get("website"),
        "extractedAt": row.get("created_at"),
        "searchId": row.get("search_id"),
        "companyId": row.get("company_id"),
        "savedAt": row.get("saved_at"),
    }


@router.post("/search")
async def search_leads(
    payload: SearchLeadsRequest,
    auth_user: dict = Depends(get_authenticated_user),
):
    """
    Busca leads no Google Maps via DataForSEO, SERVER-SIDE.

    Aplica a quota no servidor (não dá pra burlar pelo cliente):
    - bloqueia se o plano não permite ou estourou o limite;
    - capa a profundidade da busca pela quota RESTANTE (modelo por-lead);
    - incrementa `leads_used` pelo nº de leads realmente inseridos.

    Leads entram com `saved_at = NULL` (transitórios). Só viram Base de Leads
    quando o usuário salva explicitamente.
    """
    db = get_db()
    user_id = auth_user["user_id"]
    company_id = auth_user.get("company_id")

    if not company_id:
        raise HTTPException(status_code=403, detail="Usuário sem empresa associada")

    query = (payload.query or "").strip()
    location = (payload.location or "").strip()
    if not query or not location:
        raise HTTPException(status_code=400, detail="Informe o termo de busca e a localização")
    if len(query) > 200 or len(location) > 100:
        raise HTTPException(status_code=400, detail="Termo ou localização muito longos")

    # ── 1) Quota (server-side) ────────────────────────────────────────────
    full_quota = await db.get_user_quota_with_plan(user_id)
    if not full_quota:
        raise HTTPException(status_code=403, detail="Quota não encontrada")

    sub_status = full_quota.get("subscription_status")
    if sub_status in ("suspended", "cancelled", "expired"):
        raise HTTPException(status_code=402, detail=f"Conta {sub_status}. Renove para continuar.")

    leads_limit = full_quota.get("leads_limit", 0) or 0
    leads_used = full_quota.get("leads_used", 0) or 0

    if leads_limit == 0:
        raise HTTPException(status_code=403, detail="Busca de leads não disponível no seu plano")

    # remaining = None significa ilimitado
    remaining: Optional[int] = None if leads_limit == -1 else (leads_limit - leads_used)
    if remaining is not None and remaining <= 0:
        raise HTTPException(
            status_code=402,
            detail=f"Limite de leads atingido ({leads_used}/{leads_limit}). Faça upgrade ou aguarde a renovação.",
        )

    # Profundidade da busca = min(pedido, restante, teto da API)
    requested = payload.limit if (payload.limit and payload.limit > 0) else MAX_DEPTH
    depth = min(requested, MAX_DEPTH)
    if remaining is not None:
        depth = min(depth, remaining)
    depth = max(depth, 1)

    # ── 2) Histórico de busca ─────────────────────────────────────────────
    search_id = payload.search_id
    if not search_id:
        history = db.client.table("search_history").insert({
            "query": query,
            "location": location,
            "results_count": 0,
            "company_id": company_id,
            "user_id": user_id,
        }).execute()
        if not history.data:
            raise HTTPException(status_code=500, detail="Falha ao registrar a busca")
        search_id = history.data[0]["id"]

    # ── 3) DataForSEO ─────────────────────────────────────────────────────
    try:
        raw_leads = await search_google_maps(query, location, depth)
    except DataForSEOError as e:
        status = 500 if e.configuration else 503
        raise HTTPException(status_code=status, detail=str(e))

    # ── 4) Deduplicação contra leads já dessa busca ───────────────────────
    existing = db.client.table("leads")\
        .select("name")\
        .eq("search_id", search_id)\
        .eq("company_id", company_id)\
        .execute()
    existing_names = {
        (r.get("name") or "").lower().strip()
        for r in (existing.data or [])
    }

    to_insert = []
    for lead in raw_leads:
        name_key = (lead.get("name") or "").lower().strip()
        if not name_key or name_key in existing_names:
            continue
        existing_names.add(name_key)
        # Respeita o teto: nunca insere mais que a quota restante permite
        if remaining is not None and len(to_insert) >= remaining:
            break
        to_insert.append({
            **lead,
            "company_id": company_id,
            "search_id": search_id,
            # saved_at omitido => NULL => transitório (não entra na Base)
        })

    # ── 5) Insert + quota + histórico ─────────────────────────────────────
    inserted_rows = []
    if to_insert:
        result = db.client.table("leads").insert(to_insert).execute()
        inserted_rows = result.data or []
        count = len(inserted_rows)

        # Incrementa quota PELO Nº DE LEADS (modelo por-lead)
        await db.increment_quota(user_id, "search_leads", count)

        # Atualiza contagem do histórico
        try:
            db.client.table("search_history")\
                .update({"results_count": count})\
                .eq("id", search_id)\
                .execute()
        except Exception as e:
            logger.warning(f"Falha ao atualizar results_count: {e}")

    mapped = [_map_lead(r) for r in inserted_rows]
    return {
        "leads": mapped,
        "count": len(mapped),
        "searchId": search_id,
        "used": leads_used + len(mapped),
        "limit": leads_limit,
    }


class UpdateCnpjRequest(BaseModel):
    # Aceita formatos `12.345.678/0001-90` (18 chars) e `12345678000190` (14).
    cnpj: str = Field(..., min_length=14, max_length=18)


@router.post("/{lead_id}/cnpj")
async def update_lead_cnpj(
    lead_id: str,
    payload: UpdateCnpjRequest,
    auth_user: dict = Depends(get_authenticated_user),
):
    """Atualiza CNPJ do lead manualmente. Valida dígito verificador.

    Multi-tenant: só atualiza se o lead pertence à mesma company. Habilita
    o pipeline de metadata Receita Federal numa próxima execução.
    """
    company_id = auth_user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=403, detail="Usuário sem empresa associada")

    digits = normalize_cnpj(payload.cnpj)
    if not digits:
        raise HTTPException(
            status_code=400,
            detail="CNPJ inválido — verifique o formato e os dígitos verificadores",
        )

    db = get_db()
    result = (
        db.client.table("leads")
        .update({"cnpj": digits})
        .eq("id", lead_id)
        .eq("company_id", company_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    return {"id": lead_id, "cnpj": digits}


@router.post("/enrich-emails")
async def enrich_emails(
    request: Request,
    payload: EnrichEmailsRequest,
    auth_user: dict = Depends(get_authenticated_user),
):
    """Enriquece emails dos leads via cascata orquestrada + cache global por domínio.

    Endpoint SÍNCRONO — bloqueia até processar todos os leads. Adequado pra
    batches pequenos (até ~10 leads). Pra batches maiores use
    `POST /enrich-emails/async` (PR 5).

    Shape COMPAT com front atual (`useLeads.tsx` lê `data.updated[i].id` e
    `data.updated[i].email`). Campos novos são aditivos — front antigo ignora,
    front novo (PR 6) usa pra badges e indicador de cache.
    """
    try:
        db = get_db()
        company_id = auth_user["company_id"]
        user_id = auth_user.get("user_id")

        leads_response = (
            db.client.table("leads")
            .select("id, website, contact_url, cnpj")
            .in_("id", payload.lead_ids)
            .eq("company_id", company_id)
            .execute()
        )
        leads = leads_response.data or []

        if not leads:
            return {"updated": [], "total_cost_usd": 0.0, "cache_hits": 0}

        cache = SupabaseDomainEmailCache(db.client)
        orchestrator = EmailEnrichmentOrchestrator(
            cache=cache,
            cache_ttl_days=_cache_ttl_days(),
        )

        updated: list[dict] = []
        total_cost = 0.0
        cache_hits = 0
        now_iso = datetime.now(timezone.utc).isoformat()

        for lead in leads:
            try:
                result = await orchestrator.enrich(lead)
            except Exception as e:
                logger.error(
                    f"orchestrator falhou pra lead {lead.get('id')}: "
                    f"{type(e).__name__}: {e}"
                )
                continue

            total_cost += result.cost_usd
            if result.cached:
                cache_hits += 1

            persist_lead_enrichment(
                db.client, lead["id"], company_id, result, now_iso,
                lead_cnpj_already_set=bool(lead.get("cnpj")),
            )

            updated.append({
                "id": lead["id"],
                "email": result.email,
                "source": result.source,
                "confidence": result.confidence if result.confidence > 0 else None,
                "cached": result.cached,
            })

        increment_enrichment_telemetry(
            db.client, user_id, len(leads), total_cost, cache_hits,
        )

        return {
            "updated": updated,
            "total_cost_usd": round(total_cost, 4),
            "cache_hits": cache_hits,
        }

    except Exception as e:
        logger.error(f"Error enriching emails: {type(e).__name__}: {e}")
        return {"updated": [], "error": str(e)}


# =========================================================================
# PR 5 — Fila assíncrona de enrichment
# =========================================================================
# Endpoints NOVOS (síncrono permanece intacto pra não quebrar front atual).
# Frontend migra pra esses endpoints no PR 6.


def _count_jobs_by_status(sb_client, batch_id: str, company_id: str) -> dict:
    """Conta jobs do batch por status. Retorna {status: count} (multi-tenant)."""
    resp = (
        sb_client.table("enrichment_jobs")
        .select("status")
        .eq("batch_id", batch_id)
        .eq("company_id", company_id)
        .execute()
    )
    counts = {"pending": 0, "processing": 0, "completed": 0, "failed": 0}
    for row in (resp.data or []):
        s = row.get("status")
        if s in counts:
            counts[s] += 1
    return counts


@router.post("/enrich-emails/async", status_code=202)
async def enrich_emails_async(
    payload: EnrichEmailsRequest,
    background_tasks: BackgroundTasks,
    auth_user: dict = Depends(get_authenticated_user),
):
    """Enfileira enrichment dos leads e retorna `batch_id` pra polling.

    Front faz polling em `GET /enrich-emails/status/{batch_id}` pra acompanhar.
    Padrão espelha `email_campaigns/{id}/send` (BackgroundTasks single-process).

    Retorna 202 com `{batch_id, total, pending}`. Frontend antigo continua
    chamando o endpoint síncrono `POST /enrich-emails`.
    """
    db = get_db()
    company_id = auth_user["company_id"]
    user_id = auth_user["user_id"]

    if not payload.lead_ids:
        raise HTTPException(status_code=400, detail="lead_ids vazio")

    # Filtra leads que de fato pertencem à company (defense-in-depth)
    leads_resp = (
        db.client.table("leads")
        .select("id")
        .in_("id", payload.lead_ids)
        .eq("company_id", company_id)
        .execute()
    )
    valid_lead_ids = [row["id"] for row in (leads_resp.data or [])]
    if not valid_lead_ids:
        raise HTTPException(status_code=404, detail="Nenhum lead válido encontrado")

    batch_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "batch_id": batch_id,
            "lead_id": lid,
            "company_id": company_id,
            "user_id": user_id,
            "status": "pending",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        for lid in valid_lead_ids
    ]
    db.client.table("enrichment_jobs").insert(rows).execute()

    background_tasks.add_task(process_batch, batch_id, company_id)

    return {
        "batch_id": batch_id,
        "total": len(valid_lead_ids),
        "pending": len(valid_lead_ids),
    }


@router.get("/enrich-emails/status/{batch_id}")
async def enrich_emails_status(
    batch_id: str,
    auth_user: dict = Depends(get_authenticated_user),
):
    """Retorna contadores por status do batch.

    Frontend faz polling com este endpoint a cada ~2s pra exibir progresso.
    Multi-tenant: só vê batches da própria company.
    """
    db = get_db()
    company_id = auth_user["company_id"]

    counts = _count_jobs_by_status(db.client, batch_id, company_id)
    total = sum(counts.values())
    if total == 0:
        raise HTTPException(status_code=404, detail="batch não encontrado")

    return {
        "batch_id": batch_id,
        "total": total,
        "pending": counts["pending"],
        "processing": counts["processing"],
        "completed": counts["completed"],
        "failed": counts["failed"],
        "done": counts["pending"] == 0 and counts["processing"] == 0,
    }
