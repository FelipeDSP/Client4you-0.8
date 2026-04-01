import logging
import os
from fastapi import APIRouter, HTTPException, Request, Depends
from security_utils import get_authenticated_user
from waha_service import WahaService
from helpers import get_db, get_session_name_for_company

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

# ========== WhatsApp Debug Endpoint ==========
@router.get("/debug")
async def debug_whatsapp_session(
    request: Request,
    auth_user: dict = Depends(get_authenticated_user)
):
    """Endpoint de diagnóstico para verificar configuração da sessão WAHA"""
    company_id = auth_user.get("company_id")
    user_id = auth_user.get("user_id")
    
    db = get_db()
    
    # Buscar dados da empresa
    company_data = None
    try:
        company_result = db.client.table('companies')\
            .select('id, name')\
            .eq('id', company_id)\
            .single()\
            .execute()
        company_data = company_result.data
    except Exception as e:
        company_data = {"error": str(e)}
    
    # Buscar config da sessão
    waha_config = await db.get_waha_config(company_id)
    
    # Calcular nome da sessão que seria gerado
    session_name = await get_session_name_for_company(company_id)
    
    return {
        "user_id": user_id,
        "company_id": company_id,
        "company_data": company_data,
        "waha_config_from_db": waha_config,
        "computed_session_name": session_name,
        "waha_url": os.getenv('WAHA_DEFAULT_URL'),
    }


# ========== WhatsApp Management ==========

@router.get("/status")
async def get_whatsapp_status(
    request: Request,
    auth_user: dict = Depends(get_authenticated_user)
):
    company_id = auth_user.get("company_id")
    if not company_id:
        return {"status": "DISCONNECTED", "connected": False, "error": "Company ID não encontrado"}

    waha_url = os.getenv('WAHA_DEFAULT_URL')
    waha_key = os.getenv('WAHA_MASTER_KEY')
    
    if not waha_url:
        return {"status": "DISCONNECTED", "connected": False, "error": "Server config error"}

    session_name = await get_session_name_for_company(company_id)
    waha = WahaService(waha_url, waha_key, session_name)
    
    conn = await waha.check_connection()
    
    status_map = {
        "STOPPED": "DISCONNECTED",
        "STARTING": "STARTING",
        "SCAN_QR_CODE": "SCANNING",
        "SCANNING": "SCANNING",
        "WORKING": "CONNECTED",
        "CONNECTED": "CONNECTED",
        "FAILED": "DISCONNECTED"
    }
    
    waha_raw_status = conn.get("status", "DISCONNECTED")
    
    return {
        "status": status_map.get(waha_raw_status, "DISCONNECTED"),
        "connected": conn.get("connected", False),
        "session_name": session_name,
        "waha_raw_status": waha_raw_status
    }


@router.post("/session/start")
async def start_whatsapp_session(
    request: Request,
    auth_user: dict = Depends(get_authenticated_user)
):
    company_id = auth_user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID não encontrado")
    
    waha_url = os.getenv('WAHA_DEFAULT_URL')
    waha_key = os.getenv('WAHA_MASTER_KEY')
    session_name = await get_session_name_for_company(company_id)
    
    logger.info(f"🚀 Iniciando sessão: {session_name} para empresa: {company_id}")

    waha = WahaService(waha_url, waha_key, session_name)
    result = await waha.start_session()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))

    return {"status": "STARTING", "message": "Motor em inicialização...", "session_name": session_name}

@router.post("/session/stop")
async def stop_whatsapp_session(
    request: Request,
    auth_user: dict = Depends(get_authenticated_user)
):
    company_id = auth_user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID não encontrado")
    
    waha_url = os.getenv('WAHA_DEFAULT_URL')
    waha_key = os.getenv('WAHA_MASTER_KEY')
    session_name = await get_session_name_for_company(company_id)

    waha = WahaService(waha_url, waha_key, session_name)
    success = await waha.stop_session()
    return {"success": success}

@router.post("/session/logout")
async def logout_whatsapp_session(
    request: Request,
    auth_user: dict = Depends(get_authenticated_user)
):
    company_id = auth_user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID não encontrado")
    
    waha_url = os.getenv('WAHA_DEFAULT_URL')
    waha_key = os.getenv('WAHA_MASTER_KEY')
    session_name = await get_session_name_for_company(company_id)

    waha = WahaService(waha_url, waha_key, session_name)
    success = await waha.logout_session()
    return {"success": success}

@router.get("/qr")
async def get_whatsapp_qr(
    request: Request,
    auth_user: dict = Depends(get_authenticated_user)
):
    company_id = auth_user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID não encontrado")
    
    waha_url = os.getenv('WAHA_DEFAULT_URL')
    waha_key = os.getenv('WAHA_MASTER_KEY')
    session_name = await get_session_name_for_company(company_id)

    waha = WahaService(waha_url, waha_key, session_name)
    return await waha.get_qr_code()
