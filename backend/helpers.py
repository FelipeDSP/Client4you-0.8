"""
Helpers compartilhados — após a remoção do feature WhatsApp/Disparador,
o que sobrou aqui foi essencialmente `get_db()`. Mantido como módulo
separado para evitar churn de imports nos routes/services existentes.
"""
import logging
from supabase_service import get_supabase_service, SupabaseService

logger = logging.getLogger(__name__)


def get_db() -> SupabaseService:
    """Get Supabase service instance"""
    return get_supabase_service()
