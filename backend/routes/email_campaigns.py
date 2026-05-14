"""
CRUD de campanhas de email + endpoints de ação (send, pause, cancel) +
adição de destinatários a partir de leads.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from pydantic import BaseModel, EmailStr, Field

from security_utils import get_authenticated_user, handle_error
from helpers import get_db
from email_worker import process_campaign, gen_tracking_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/email-campaigns", tags=["email-campaigns"])


# ─── Pydantic models ───────────────────────────────────────────────────────

class EmailCampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    subject: str = Field(..., min_length=1)
    body_html: str = Field(..., min_length=1)
    body_text: Optional[str] = None
    email_account_id: UUID
    interval_seconds: int = Field(30, ge=5, le=3600)


class EmailCampaignUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    subject: Optional[str] = Field(None, min_length=1)
    body_html: Optional[str] = Field(None, min_length=1)
    body_text: Optional[str] = None
    email_account_id: Optional[UUID] = None
    interval_seconds: Optional[int] = Field(None, ge=5, le=3600)
    scheduled_at: Optional[datetime] = None


class AddRecipientsFromLeads(BaseModel):
    lead_ids: List[UUID]


class AddRecipientsManual(BaseModel):
    """Adicionar destinatários manualmente (sem ser de leads)."""
    recipients: List[dict]  # cada item: {email, name?, template_vars?}


# ─── List / Get / Create / Update / Delete ─────────────────────────────────

@router.get("")
async def list_campaigns(
    auth_user: dict = Depends(get_authenticated_user),
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """Lista campanhas da empresa."""
    try:
        db = get_db()
        company_id = auth_user["company_id"]
        query = db.client.table("email_campaigns")\
            .select("*", count="exact")\
            .eq("company_id", company_id)\
            .order("created_at", desc=True)
        if status:
            query = query.eq("status", status)
        result = query.range(offset, offset + limit - 1).execute()
        return {
            "campaigns": result.data or [],
            "total": result.count or 0,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        raise handle_error(e, "Erro ao listar campanhas")


@router.get("/{campaign_id}")
async def get_campaign(
    campaign_id: UUID,
    auth_user: dict = Depends(get_authenticated_user),
):
    try:
        db = get_db()
        result = db.client.table("email_campaigns")\
            .select("*")\
            .eq("id", str(campaign_id))\
            .eq("company_id", auth_user["company_id"])\
            .maybe_single()\
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao buscar campanha")


@router.post("", status_code=201)
async def create_campaign(
    payload: EmailCampaignCreate,
    auth_user: dict = Depends(get_authenticated_user),
):
    """Cria draft. Não envia nada — chame /send pra disparar."""
    try:
        db = get_db()
        company_id = auth_user["company_id"]
        if not company_id:
            raise HTTPException(status_code=400, detail="Usuário sem company_id")

        # Valida que email_account pertence ao usuário/company
        acc_check = db.client.table("email_accounts")\
            .select("id, is_verified")\
            .eq("id", str(payload.email_account_id))\
            .eq("user_id", auth_user["user_id"])\
            .maybe_single()\
            .execute()
        if not acc_check.data:
            raise HTTPException(status_code=400, detail="email_account_id inválido ou não é seu")

        row = {
            "company_id": company_id,
            "user_id": auth_user["user_id"],
            "email_account_id": str(payload.email_account_id),
            "name": payload.name,
            "subject": payload.subject,
            "body_html": payload.body_html,
            "body_text": payload.body_text,
            "interval_seconds": payload.interval_seconds,
            "status": "draft",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        result = db.client.table("email_campaigns").insert(row).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Falha ao criar campanha")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao criar campanha")


@router.put("/{campaign_id}")
async def update_campaign(
    campaign_id: UUID,
    payload: EmailCampaignUpdate,
    auth_user: dict = Depends(get_authenticated_user),
):
    """Atualiza campos editáveis. Só permitido em status draft ou paused."""
    try:
        db = get_db()
        existing = db.client.table("email_campaigns")\
            .select("status")\
            .eq("id", str(campaign_id))\
            .eq("company_id", auth_user["company_id"])\
            .maybe_single()\
            .execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")
        if existing.data["status"] not in ("draft", "paused"):
            raise HTTPException(
                status_code=400,
                detail=f"Só dá pra editar em draft/paused. Status atual: {existing.data['status']}"
            )

        update_data = payload.model_dump(exclude_unset=True)
        if "email_account_id" in update_data:
            update_data["email_account_id"] = str(update_data["email_account_id"])
        if "scheduled_at" in update_data and update_data["scheduled_at"]:
            update_data["scheduled_at"] = update_data["scheduled_at"].isoformat()
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        result = db.client.table("email_campaigns")\
            .update(update_data)\
            .eq("id", str(campaign_id))\
            .execute()
        return result.data[0] if result.data else {"updated": True}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao atualizar campanha")


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: UUID,
    auth_user: dict = Depends(get_authenticated_user),
):
    """Deleta. Bloqueia se status='sending'."""
    try:
        db = get_db()
        existing = db.client.table("email_campaigns")\
            .select("status")\
            .eq("id", str(campaign_id))\
            .eq("company_id", auth_user["company_id"])\
            .maybe_single()\
            .execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")
        if existing.data["status"] == "sending":
            raise HTTPException(
                status_code=400,
                detail="Não dá pra deletar uma campanha que está enviando. Pause ou cancele primeiro."
            )
        db.client.table("email_campaigns")\
            .delete()\
            .eq("id", str(campaign_id))\
            .execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao deletar campanha")


# ─── Recipients ────────────────────────────────────────────────────────────

@router.get("/{campaign_id}/recipients")
async def list_recipients(
    campaign_id: UUID,
    auth_user: dict = Depends(get_authenticated_user),
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    try:
        db = get_db()
        # confirma ownership
        camp = db.client.table("email_campaigns")\
            .select("id")\
            .eq("id", str(campaign_id))\
            .eq("company_id", auth_user["company_id"])\
            .maybe_single()\
            .execute()
        if not camp.data:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")

        query = db.client.table("email_campaign_recipients")\
            .select("*", count="exact")\
            .eq("campaign_id", str(campaign_id))\
            .order("created_at")
        if status:
            query = query.eq("status", status)
        result = query.range(offset, offset + limit - 1).execute()
        return {
            "recipients": result.data or [],
            "total": result.count or 0,
            "limit": limit,
            "offset": offset,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao listar recipients")


@router.post("/{campaign_id}/recipients/from-leads")
async def add_recipients_from_leads(
    campaign_id: UUID,
    payload: AddRecipientsFromLeads,
    auth_user: dict = Depends(get_authenticated_user),
):
    """
    Adiciona destinatários a partir de uma lista de lead_ids.
    Filtra leads sem email, e leads já adicionados como recipients.
    """
    try:
        db = get_db()
        company_id = auth_user["company_id"]

        # Valida campanha + status
        camp = db.client.table("email_campaigns")\
            .select("id, status")\
            .eq("id", str(campaign_id))\
            .eq("company_id", company_id)\
            .maybe_single()\
            .execute()
        if not camp.data:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")
        if camp.data["status"] not in ("draft", "paused"):
            raise HTTPException(
                status_code=400,
                detail=f"Só dá pra adicionar recipients em draft/paused. Status atual: {camp.data['status']}"
            )

        if not payload.lead_ids:
            raise HTTPException(status_code=400, detail="Lista vazia")

        # Busca leads da empresa
        lead_ids = [str(lid) for lid in payload.lead_ids]
        leads_res = db.client.table("leads")\
            .select("id, name, email")\
            .in_("id", lead_ids)\
            .eq("company_id", company_id)\
            .execute()
        leads = [l for l in (leads_res.data or []) if l.get("email")]

        if not leads:
            raise HTTPException(status_code=400, detail="Nenhum lead com email válido")

        # Filtra emails que já são recipients
        emails = [l["email"] for l in leads]
        existing = db.client.table("email_campaign_recipients")\
            .select("email")\
            .eq("campaign_id", str(campaign_id))\
            .in_("email", emails)\
            .execute()
        existing_emails = {r["email"] for r in (existing.data or [])}

        to_insert = []
        for lead in leads:
            if lead["email"] in existing_emails:
                continue
            to_insert.append({
                "campaign_id": str(campaign_id),
                "lead_id": lead["id"],
                "email": lead["email"],
                "name": lead.get("name"),
                "template_vars": {"nome": lead.get("name") or "", "email": lead["email"]},
                "status": "pending",
                "tracking_token": gen_tracking_token(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        if not to_insert:
            return {"added": 0, "skipped": len(leads), "message": "Todos os leads já eram recipients"}

        # Insere em batch
        db.client.table("email_campaign_recipients").insert(to_insert).execute()

        # Atualiza total_recipients
        current = db.client.table("email_campaigns")\
            .select("total_recipients")\
            .eq("id", str(campaign_id))\
            .maybe_single()\
            .execute()
        new_total = (current.data.get("total_recipients") or 0) + len(to_insert)
        db.client.table("email_campaigns").update({
            "total_recipients": new_total,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", str(campaign_id)).execute()

        return {
            "added": len(to_insert),
            "skipped": len(leads) - len(to_insert),
            "total_recipients": new_total,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao adicionar recipients")


# ─── Ações: send / pause / cancel ──────────────────────────────────────────

@router.post("/{campaign_id}/send")
async def send_campaign(
    campaign_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    auth_user: dict = Depends(get_authenticated_user),
):
    """
    Dispara o worker pra processar pendentes. Pode ser chamado várias vezes
    (idempotente — worker se auto-bloqueia se já estiver rodando).
    """
    try:
        db = get_db()
        # Confirma ownership + valida estado
        camp = db.client.table("email_campaigns")\
            .select("id, status, total_recipients, email_account_id")\
            .eq("id", str(campaign_id))\
            .eq("company_id", auth_user["company_id"])\
            .maybe_single()\
            .execute()
        if not camp.data:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")

        c = camp.data
        if c["status"] in ("sent", "cancelled", "failed"):
            raise HTTPException(status_code=400, detail=f"Campanha já está em status terminal ({c['status']})")
        if (c.get("total_recipients") or 0) == 0:
            raise HTTPException(status_code=400, detail="Adicione recipients antes de enviar")

        # Valida account verificada
        acc = db.client.table("email_accounts")\
            .select("is_verified")\
            .eq("id", c["email_account_id"])\
            .maybe_single()\
            .execute()
        if not acc.data:
            raise HTTPException(status_code=400, detail="email_account não encontrada")
        if not acc.data.get("is_verified"):
            raise HTTPException(
                status_code=400,
                detail="email_account não foi verificada. Vá em Settings → Email e clique em 'Testar conexão'."
            )

        # Calcula base_url pra tracking (precisa ser URL pública)
        # Em dev = http://localhost:8000; em prod via Coolify = https://api.client4you.com.br
        base_url = str(request.base_url).rstrip("/")

        # Dispara worker em background
        background_tasks.add_task(process_campaign, str(campaign_id), base_url)

        return {
            "status": "started",
            "campaign_id": str(campaign_id),
            "message": "Worker disparado em background"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao iniciar envio")


@router.post("/{campaign_id}/pause")
async def pause_campaign(
    campaign_id: UUID,
    auth_user: dict = Depends(get_authenticated_user),
):
    try:
        db = get_db()
        result = db.client.table("email_campaigns")\
            .update({
                "status": "paused",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })\
            .eq("id", str(campaign_id))\
            .eq("company_id", auth_user["company_id"])\
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao pausar campanha")


@router.post("/{campaign_id}/cancel")
async def cancel_campaign(
    campaign_id: UUID,
    auth_user: dict = Depends(get_authenticated_user),
):
    try:
        db = get_db()
        result = db.client.table("email_campaigns")\
            .update({
                "status": "cancelled",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })\
            .eq("id", str(campaign_id))\
            .eq("company_id", auth_user["company_id"])\
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao cancelar campanha")


# ─── Events ────────────────────────────────────────────────────────────────

@router.get("/{campaign_id}/events")
async def list_events(
    campaign_id: UUID,
    auth_user: dict = Depends(get_authenticated_user),
    event_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    """Lista eventos brutos (open/click/bounce/etc.) pra audit/analytics."""
    try:
        db = get_db()
        # confirma ownership
        camp = db.client.table("email_campaigns")\
            .select("id")\
            .eq("id", str(campaign_id))\
            .eq("company_id", auth_user["company_id"])\
            .maybe_single()\
            .execute()
        if not camp.data:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")

        query = db.client.table("email_events")\
            .select("*", count="exact")\
            .eq("campaign_id", str(campaign_id))\
            .order("occurred_at", desc=True)
        if event_type:
            query = query.eq("event_type", event_type)
        result = query.range(offset, offset + limit - 1).execute()
        return {
            "events": result.data or [],
            "total": result.count or 0,
            "limit": limit,
            "offset": offset,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao listar eventos")
