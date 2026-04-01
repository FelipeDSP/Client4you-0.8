import time as time_module
import re
import logging
from models import CampaignStats
from supabase_service import get_supabase_service, SupabaseService

logger = logging.getLogger(__name__)

# ========== Helper Functions ==========
def get_db() -> SupabaseService:
    """Get Supabase service instance"""
    return get_supabase_service()

# ========== In-memory cache for session names (Problem 3 fix) ==========
# Cache: company_id -> (session_name, timestamp)
_session_name_cache: dict[str, tuple[str, float]] = {}
_SESSION_CACHE_TTL = 300  # 5 minutes


async def get_session_name_for_company(company_id: str, company_name: str = None) -> str:
    """
    Define o nome da sessão do WhatsApp de forma segura.
    Formato: nome_empresa_id (ex: "acme_corp_efdaca5d")
    Uses in-memory cache with 5-minute TTL to avoid repeated DB queries.
    """

    # Check cache first
    if company_id in _session_name_cache:
        cached_name, cached_time = _session_name_cache[company_id]
        if (time_module.time() - cached_time) < _SESSION_CACHE_TTL:
            return cached_name

    logger.info(f"Buscando sessão para company_id: {company_id} (cache miss)")

    session_name = None
    try:
        db = get_db()
        config = await db.get_waha_config(company_id)

        if config and config.get("session_name"):
            session_name = config.get("session_name")
            logger.info(f"Usando sessão do banco: {session_name}")
        else:
            if not company_name:
                try:
                    company_result = db.client.table('companies')\
                        .select('name')\
                        .eq('id', company_id)\
                        .single()\
                        .execute()
                    if company_result.data:
                        company_name = company_result.data.get('name')
                except Exception as e:
                    logger.warning(f"Não encontrou nome da empresa: {e}")

            if company_name:
                safe_name = re.sub(r'[^a-zA-Z0-9]', '_', company_name.lower())
                safe_name = re.sub(r'_+', '_', safe_name).strip('_')[:30]
                short_id = company_id.split('-')[0] if company_id else 'unknown'
                session_name = f"{safe_name}_{short_id}"
            else:
                session_name = f"company_{company_id.split('-')[0] if company_id else 'unknown'}"
                logger.warning(f"Usando fallback: {session_name}")

    except Exception as e:
        logger.warning(f"Usando sessão padrão devido a erro: {e}")
        session_name = f"company_{company_id.split('-')[0] if company_id else 'unknown'}"

    # Store in cache
    _session_name_cache[company_id] = (session_name, time_module.time())
    return session_name


def calculate_campaign_stats(campaign: dict) -> CampaignStats:
    total = campaign.get("total_contacts", 0)
    sent = campaign.get("sent_count", 0)
    errors = campaign.get("error_count", 0)
    pending = campaign.get("pending_count", 0)
    
    progress = (sent / total * 100) if total > 0 else 0
    
    return CampaignStats(
        total=total,
        sent=sent,
        pending=pending,
        errors=errors,
        progress_percent=round(progress, 1)
    )

def campaign_to_response(campaign_data: dict) -> dict:
    return {
        "id": campaign_data["id"],
        "user_id": campaign_data.get("user_id"),
        "company_id": campaign_data.get("company_id"),
        "name": campaign_data["name"],
        "status": campaign_data.get("status", "draft"),
        "message": {
            "type": campaign_data.get("message_type", "text"),
            "text": campaign_data.get("message_text", ""),
            "media_url": campaign_data.get("media_url"),
            "media_filename": campaign_data.get("media_filename")
        },
        "settings": {
            "interval_min": campaign_data.get("interval_min", 30),
            "interval_max": campaign_data.get("interval_max", 60),
            "start_time": campaign_data.get("start_time"),
            "end_time": campaign_data.get("end_time"),
            "daily_limit": campaign_data.get("daily_limit"),
            "working_days": campaign_data.get("working_days", [0, 1, 2, 3, 4])
        },
        "total_contacts": campaign_data.get("total_contacts", 0),
        "sent_count": campaign_data.get("sent_count", 0),
        "error_count": campaign_data.get("error_count", 0),
        "pending_count": campaign_data.get("pending_count", 0),
        "created_at": campaign_data.get("created_at"),
        "updated_at": campaign_data.get("updated_at"),
        "started_at": campaign_data.get("started_at"),
        "completed_at": campaign_data.get("completed_at")
    }
