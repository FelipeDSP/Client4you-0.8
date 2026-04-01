import os
import logging
import asyncio
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Request, Depends
from security_utils import get_authenticated_user
from waha_service import WahaService
from helpers import get_db, get_session_name_for_company

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/leads", tags=["leads"])

class ValidateLeadsRequest(BaseModel):
    lead_ids: List[str]

@router.post("/validate")
async def validate_leads_batch(
    request: Request,
    payload: ValidateLeadsRequest,
    auth_user: dict = Depends(get_authenticated_user)
):
    """
    Valida uma lista de leads no WAHA para saber se têm WhatsApp.
    Atualiza o banco de dados automaticamente.
    """
    try:
        db = get_db()
        company_id = auth_user["company_id"]
        
        # 1. Configurar WAHA
        waha_url = os.getenv('WAHA_DEFAULT_URL')
        waha_key = os.getenv('WAHA_MASTER_KEY')
        session_name = await get_session_name_for_company(company_id)
        waha = WahaService(waha_url, waha_key, session_name)
        
        # 2. Verificar conexão
        conn = await waha.check_connection()
        if not conn.get("connected"):
            return {"updated": [], "warning": "WhatsApp desconectado"}

        # 3. Buscar os leads no banco
        leads_response = db.client.table("leads")\
            .select("id, phone, has_whatsapp")\
            .in_("id", payload.lead_ids)\
            .eq("company_id", company_id)\
            .execute()
            
        leads = leads_response.data or []
        updated_leads = []
        
        async def check_lead_waha(lead_item):
            phone = lead_item.get("phone")
            if not phone:
                return None
            try:
                has_w = await waha.check_number_exists(phone)
                if has_w:
                    return lead_item["id"]
            except Exception:
                pass
            return None

        valid_lead_ids = []
        # Faz validação concorrente controlada para não sobrecarregar WAHA
        batch_size = 10
        for i in range(0, len(leads), batch_size):
            chunk = leads[i:i + batch_size]
            results = await asyncio.gather(*(check_lead_waha(l) for l in chunk))
            valid_lead_ids.extend([res for res in results if res is not None])
            
        updated_leads = []
        # Faz update em lote no banco
        if valid_lead_ids:
            # Note: O Supabase SDK e PostgREST suportam updates em lote usando .in_()
            db.client.table("leads")\
                .update({"has_whatsapp": True})\
                .in_("id", valid_lead_ids)\
                .execute()
                
            updated_leads = [{"id": lid, "has_whatsapp": True} for lid in valid_lead_ids]
        
        return {"updated": updated_leads}

    except Exception as e:
        logger.error(f"Error validating leads: {e}")
        # Não falha a requisição inteira se o Waha der erro, apenas retorna vazio
        return {"updated": [], "error": str(e)}
