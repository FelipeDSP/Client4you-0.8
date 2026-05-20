import logging
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Request, Depends, HTTPException
from security_utils import get_authenticated_user, handle_error
from helpers import get_db
from firecrawl_service import extract_emails_bulk
from dataforseo_service import search_google_maps, DataForSEOError, MAX_DEPTH

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


@router.post("/enrich-emails")
async def enrich_emails(
    request: Request,
    payload: EnrichEmailsRequest,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        company_id = auth_user["company_id"]

        leads_response = db.client.table("leads")\
            .select("id, website")\
            .in_("id", payload.lead_ids)\
            .eq("company_id", company_id)\
            .execute()

        leads = leads_response.data or []

        # Processa todos os leads em paralelo
        email_map = await extract_emails_bulk(leads)

        updated = []
        for lead_id, email in email_map.items():
            db.client.table("leads")\
                .update({"email": email, "has_email": True})\
                .eq("id", lead_id)\
                .eq("company_id", company_id)\
                .execute()
            updated.append({"id": lead_id, "email": email})

        return {"updated": updated}

    except Exception as e:
        logger.error(f"Error enriching emails: {e}")
        return {"updated": [], "error": str(e)}
