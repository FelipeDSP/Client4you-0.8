import os
import uuid
import logging
import httpx
import pandas as pd
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Request, Depends
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from models import CampaignCreate, CampaignUpdate, CampaignMessage, CampaignSettings
from waha_service import WahaService
from security_utils import (
    get_authenticated_user,
    validate_file_upload,
    sanitize_csv_value,
    handle_error,
    validate_campaign_ownership,
    validate_quota_for_action
)
from helpers import get_db, get_session_name_for_company, calculate_campaign_stats, campaign_to_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/campaigns", tags=["campaigns"])
limiter = Limiter(key_func=get_remote_address)

@router.post("")
@limiter.limit("50/hour")
async def create_campaign(
    request: Request,
    campaign: CampaignCreate,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        logger.info(f"📝 Criando campanha: {campaign.name}")
        logger.info(f"📝 Message type: {campaign.message.type}")
        logger.info(f"📝 Settings: interval={campaign.settings.interval_min}-{campaign.settings.interval_max}")
        
        db = get_db()
        await validate_quota_for_action(
            user_id=auth_user["user_id"],
            action="create_campaign",
            required_plan=["intermediario", "avancado"],
            db=db
        )
        
        campaign_data = {
            "id": str(uuid.uuid4()),
            "company_id": auth_user["company_id"],
            "user_id": auth_user["user_id"],
            "name": campaign.name,
            "status": "draft",
            "message_type": campaign.message.type,
            "message_text": campaign.message.text,
            "media_url": campaign.message.media_url,
            "media_filename": campaign.message.media_filename,
            "interval_min": campaign.settings.interval_min,
            "interval_max": campaign.settings.interval_max,
            "start_time": campaign.settings.start_time,
            "end_time": campaign.settings.end_time,
            "daily_limit": campaign.settings.daily_limit,
            "working_days": campaign.settings.working_days,
            "total_contacts": 0,
            "sent_count": 0,
            "error_count": 0,
            "pending_count": 0
        }
        
        result = await db.create_campaign(campaign_data)
        if not result:
            raise HTTPException(status_code=500, detail="Erro ao criar campanha")
        
        await db.increment_quota(auth_user["user_id"], "create_campaign")
        
        return campaign_to_response(result)
    
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao criar campanha")


class CampaignFromLeadsRequest(BaseModel):
    name: str
    message: CampaignMessage
    settings: CampaignSettings = Field(default_factory=CampaignSettings)
    contacts: List[dict]


@router.post("/from-leads")
@limiter.limit("20/hour")
async def create_campaign_from_leads(
    request: Request,
    data: CampaignFromLeadsRequest,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        logger.info(f"📝 Criando campanha dos leads: {data.name} ({len(data.contacts)} contatos)")
        
        db = get_db()
        await validate_quota_for_action(
            user_id=auth_user["user_id"],
            action="create_campaign",
            required_plan=["intermediario", "avancado"],
            db=db
        )
        
        if not data.contacts or len(data.contacts) == 0:
            raise HTTPException(status_code=400, detail="É necessário pelo menos 1 contato")
        
        if len(data.contacts) > 5000:
            raise HTTPException(status_code=400, detail="Máximo de 5000 contatos por campanha")
        
        campaign_id = str(uuid.uuid4())
        
        campaign_data = {
            "id": campaign_id,
            "company_id": auth_user["company_id"],
            "user_id": auth_user["user_id"],
            "name": data.name,
            "status": "draft",
            "message_type": data.message.type,
            "message_text": data.message.text,
            "media_url": data.message.media_url,
            "media_filename": data.message.media_filename,
            "interval_min": data.settings.interval_min,
            "interval_max": data.settings.interval_max,
            "start_time": data.settings.start_time,
            "end_time": data.settings.end_time,
            "daily_limit": data.settings.daily_limit,
            "working_days": data.settings.working_days,
            "total_contacts": len(data.contacts),
            "sent_count": 0,
            "error_count": 0,
            "pending_count": len(data.contacts)
        }
        
        result = await db.create_campaign(campaign_data)
        if not result:
            raise HTTPException(status_code=500, detail="Erro ao criar campanha")
        
        contacts_to_insert = []
        for contact in data.contacts:
            phone = contact.get("phone", "").strip()
            phone = ''.join(filter(str.isdigit, phone))
            if len(phone) < 10:
                continue
            
            contacts_to_insert.append({
                "campaign_id": campaign_id,
                "name": contact.get("name", "Sem nome")[:100],
                "phone": phone,
                "category": contact.get("category", "")[:50] if contact.get("category") else None,
                "extra_data": contact.get("extra_data", {}),
                "status": "pending"
            })
        
        batch_size = 500
        for i in range(0, len(contacts_to_insert), batch_size):
            batch = contacts_to_insert[i:i + batch_size]
            db.client.table("campaign_contacts").insert(batch).execute()
        
        actual_count = len(contacts_to_insert)
        if actual_count != len(data.contacts):
            db.client.table("campaigns").update({
                "total_contacts": actual_count,
                "pending_count": actual_count
            }).eq("id", campaign_id).execute()
        
        await db.increment_quota(auth_user["user_id"], "create_campaign")
        
        logger.info(f"✅ Campanha {campaign_id} criada com {actual_count} contatos")
        
        final_result = db.client.table("campaigns").select("*").eq("id", campaign_id).single().execute()
        return campaign_to_response(final_result.data) if final_result.data else result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao criar campanha dos leads: {e}")
        raise handle_error(e, "Erro ao criar campanha")


@router.get("")
async def list_campaigns(
    request: Request,
    auth_user: dict = Depends(get_authenticated_user),
    limit: int = 50,
    skip: int = 0
):
    try:
        db = get_db()
        company_id = auth_user["company_id"]
        campaigns_data = await db.get_campaigns_by_company(company_id, limit, skip)
        
        campaigns_with_stats = []
        for c in campaigns_data:
            campaign_dict = campaign_to_response(c)
            campaign_dict["stats"] = calculate_campaign_stats(c).dict()
            campaign_dict["is_worker_running"] = (c.get("status") == "running")
            campaigns_with_stats.append(campaign_dict)
        
        return {"campaigns": campaigns_with_stats}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao listar campanhas")


@router.get("/{campaign_id}")
async def get_campaign(
    campaign_id: str,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        campaign_data = await validate_campaign_ownership(
            campaign_id, 
            auth_user["company_id"],
            db
        )
        stats = calculate_campaign_stats(campaign_data)
        return {
            "campaign": campaign_to_response(campaign_data),
            "stats": stats,
            "is_worker_running": (campaign_data.get("status") == "running")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao buscar campanha")


@router.put("/{campaign_id}")
async def update_campaign(
    campaign_id: str,
    update: CampaignUpdate,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        campaign_data = await validate_campaign_ownership(
            campaign_id,
            auth_user["company_id"],
            db
        )
        
        update_dict = {}
        if update.name is not None:
            update_dict["name"] = update.name
        if update.message is not None:
            update_dict["message_type"] = update.message.type.value
            update_dict["message_text"] = update.message.text
            update_dict["media_url"] = update.message.media_url
            update_dict["media_filename"] = update.message.media_filename
        if update.settings is not None:
            update_dict["interval_min"] = update.settings.interval_min
            update_dict["interval_max"] = update.settings.interval_max
            update_dict["start_time"] = update.settings.start_time
            update_dict["end_time"] = update.settings.end_time
            update_dict["daily_limit"] = update.settings.daily_limit
            update_dict["working_days"] = update.settings.working_days
        
        if update_dict:
            updated = await db.update_campaign(campaign_id, update_dict)
            if updated:
                return campaign_to_response(updated)
        
        return campaign_to_response(campaign_data)
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao atualizar campanha")


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        await validate_campaign_ownership(
            campaign_id,
            auth_user["company_id"],
            db
        )
        await db.delete_contacts_by_campaign(campaign_id)
        await db.delete_message_logs_by_campaign(campaign_id)
        result = await db.delete_campaign(campaign_id)
        if not result:
            raise HTTPException(status_code=404, detail="Campanha não encontrada")
        return {"success": True, "message": "Campanha excluída com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao deletar campanha")


@router.post("/{campaign_id}/upload")
@limiter.limit("10/hour")
async def upload_contacts(
    request: Request,
    campaign_id: str,
    file: UploadFile = File(...),
    phone_column: str = Form(default="Telefone"),
    name_column: str = Form(default="Nome"),
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        logger.info(f"📤 Upload iniciado para campanha: {campaign_id}")
        logger.info(f"📤 Arquivo: {file.filename if file else 'NONE'}")
        
        db = get_db()
        campaign_data = await validate_campaign_ownership(
            campaign_id,
            auth_user["company_id"],
            db
        )
        
        file_size = file.size if hasattr(file, 'size') else 0
        is_valid, error_msg = validate_file_upload(b"", file.filename)
        if file_size > (10 * 1024 * 1024):
            is_valid, error_msg = False, "Arquivo muito grande (máximo 10MB)"
            
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)
        
        try:
            if file.filename.endswith('.xlsx') or file.filename.endswith('.xls'):
                df = pd.read_excel(file.file, engine='openpyxl')
            else:
                try:
                    df = pd.read_excel(file.file, encoding='utf-8')
                except TypeError:
                    file.file.seek(0)
                    df = pd.read_csv(file.file, encoding='utf-8')
                except UnicodeDecodeError:
                    file.file.seek(0)
                    df = pd.read_csv(file.file, encoding='latin-1')
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo: formato inválido")
        
        df.columns = df.columns.str.strip()
        phone_col = None
        name_col = None
        
        for col in df.columns:
            col_lower = col.lower()
            if phone_column.lower() in col_lower or col_lower in ['telefone', 'phone', 'tel', 'celular', 'whatsapp']:
                phone_col = col
            if name_column.lower() in col_lower or col_lower in ['nome', 'name', 'empresa', 'company']:
                name_col = col
        
        if not phone_col:
            raise HTTPException(
                status_code=400, 
                detail=f"Coluna de telefone não encontrada. Colunas disponíveis: {list(df.columns)}"
            )
        
        await db.delete_contacts_by_campaign(campaign_id)
        
        contacts = []
        skipped = 0
        
        for _, row in df.iterrows():
            phone = str(row[phone_col]).strip() if pd.notna(row[phone_col]) else ""
            if not phone or phone == "nan":
                skipped += 1
                continue
            
            raw_name = str(row[name_col]).strip() if name_col and pd.notna(row.get(name_col)) else "Sem nome"
            name = sanitize_csv_value(raw_name)
            
            extra_data = {}
            for col in df.columns:
                if col not in [phone_col, name_col]:
                    value = row[col]
                    if pd.notna(value):
                        extra_data[col] = sanitize_csv_value(value)
            
            contact = {
                "id": str(uuid.uuid4()),
                "campaign_id": campaign_id,
                "name": name,
                "phone": phone,
                "email": extra_data.get("Email") or extra_data.get("email"),
                "category": extra_data.get("Categoria") or extra_data.get("categoria") or extra_data.get("Category"),
                "extra_data": extra_data,
                "status": "pending"
            }
            contacts.append(contact)
        
        if contacts:
            await db.create_contacts(contacts)
        
        await db.update_campaign(campaign_id, {
            "total_contacts": len(contacts),
            "pending_count": len(contacts),
            "sent_count": 0,
            "error_count": 0,
            "status": "ready"
        })
        
        return {
            "success": True,
            "total_imported": len(contacts),
            "skipped": skipped,
            "columns_found": list(df.columns),
            "phone_column_used": phone_col,
            "name_column_used": name_col
        }
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao processar arquivo de contatos")


@router.get("/{campaign_id}/contacts")
async def get_campaign_contacts(
    campaign_id: str,
    auth_user: dict = Depends(get_authenticated_user),
    status: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    try:
        db = get_db()
        await validate_campaign_ownership(
            campaign_id,
            auth_user["company_id"],
            db
        )
        contacts_data = await db.get_contacts_by_campaign(campaign_id, status, limit, skip)
        total = await db.count_contacts(campaign_id, status)
        return {"contacts": contacts_data, "total": total, "limit": limit, "skip": skip}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao buscar contatos")


@router.post("/{campaign_id}/start")
@limiter.limit("30/hour")
async def start_campaign(
    request: Request,
    campaign_id: str, 
    background_tasks: BackgroundTasks,
    auth_user: dict = Depends(get_authenticated_user),
    waha_url: Optional[str] = None,
    waha_api_key: Optional[str] = None,
    waha_session: Optional[str] = "default"
):
    try:
        db = get_db()
        campaign_data = await validate_campaign_ownership(
            campaign_id,
            auth_user["company_id"],
            db
        )
        await validate_quota_for_action(
            user_id=auth_user["user_id"],
            action="start_campaign",
            required_plan=["intermediario", "avancado"],
            db=db
        )
        
        if campaign_data.get("total_contacts", 0) == 0:
            raise HTTPException(status_code=400, detail="Campanha não tem contatos. Faça upload primeiro.")
        
        final_waha_url = os.getenv('WAHA_DEFAULT_URL') or waha_url
        final_waha_key = os.getenv('WAHA_MASTER_KEY') or waha_api_key
        
        if not final_waha_url or not final_waha_key:
            raise HTTPException(
                status_code=500, 
                detail="Erro de configuração: WAHA_DEFAULT_URL não configurada no servidor."
            )
        
        target_company_id = auth_user["company_id"]
        if waha_session and waha_session != "default":
            final_session = waha_session
        else:
            final_session = await get_session_name_for_company(target_company_id)

        waha = WahaService(final_waha_url, final_waha_key, final_session)
        connection = await waha.check_connection()
        if not connection.get("connected"):
            raise HTTPException(
                status_code=400, 
                detail="WhatsApp desconectado. Vá em Configurações e clique em 'Gerar QR Code'."
            )
        
        await db.update_campaign(campaign_id, {
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat()
        })
        
        n8n_webhook_url = os.environ.get("N8N_CAMPAIGN_WEBHOOK_URL")
        if n8n_webhook_url:
            async def trigger_webhook():
                async with httpx.AsyncClient() as client:
                    try:
                        payload = {
                            "campaign_id": campaign_id,
                            "company_id": auth_user["company_id"],
                            "user_id": auth_user["user_id"],
                            "action": "start"
                        }
                        await client.post(n8n_webhook_url, json=payload, timeout=5.0)
                        logger.info(f"Triggered n8n webhook for campaign {campaign_id}")
                    except Exception as e:
                        logger.error(f"Failed to trigger n8n webhook: {e}")
            
            background_tasks.add_task(trigger_webhook)
        else:
            logger.warning("N8N_CAMPAIGN_WEBHOOK_URL não está configurada.")
        
        await db.increment_quota(auth_user["user_id"], "start_campaign")
        return {"success": True, "message": "Campanha iniciada com sucesso (Webhook disparado)"}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao iniciar campanha")


@router.post("/{campaign_id}/pause")
async def pause_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        await validate_campaign_ownership(
            campaign_id,
            auth_user["company_id"],
            db
        )
        await db.update_campaign(campaign_id, {"status": "paused"})
        
        n8n_webhook_url = os.environ.get("N8N_CAMPAIGN_WEBHOOK_URL")
        if n8n_webhook_url:
            async def trigger_pause():
                async with httpx.AsyncClient() as client:
                    try:
                        await client.post(n8n_webhook_url, json={"campaign_id": campaign_id, "action": "pause"}, timeout=3.0)
                    except Exception:
                        pass
            background_tasks.add_task(trigger_pause)
            
        return {"success": True, "message": "Campanha pausada"}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao pausar campanha")


@router.post("/{campaign_id}/cancel")
async def cancel_campaign(
    campaign_id: str,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        await validate_campaign_ownership(
            campaign_id,
            auth_user["company_id"],
            db
        )
        await db.update_campaign(campaign_id, {"status": "cancelled"})
        return {"success": True, "message": "Campanha cancelada"}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao cancelar campanha")


@router.post("/{campaign_id}/reset")
async def reset_campaign(
    campaign_id: str,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        await validate_campaign_ownership(
            campaign_id,
            auth_user["company_id"],
            db
        )
        await db.reset_contacts_status(campaign_id)
        total = await db.count_contacts(campaign_id)
        await db.update_campaign(campaign_id, {
            "status": "ready",
            "total_contacts": total,
            "pending_count": total,
            "sent_count": 0,
            "error_count": 0,
            "started_at": None,
            "completed_at": None
        })
        await db.delete_message_logs_by_campaign(campaign_id)
        return {"success": True, "message": "Campanha resetada"}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao resetar campanha")


@router.get("/{campaign_id}/logs")
async def get_message_logs(
    campaign_id: str,
    auth_user: dict = Depends(get_authenticated_user),
    status: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    try:
        db = get_db()
        await validate_campaign_ownership(
            campaign_id,
            auth_user["company_id"],
            db
        )
        logs_data = await db.get_message_logs(campaign_id, status, limit, skip)
        total = await db.count_message_logs(campaign_id, status)
        return {"logs": logs_data, "total": total, "limit": limit, "skip": skip}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao buscar logs")
