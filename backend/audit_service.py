"""
Audit Service
Sistema de logs de auditoria para ações administrativas
"""
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Any
from supabase_service import get_supabase_service

logger = logging.getLogger(__name__)


class AuditService:
    """Serviço de logs de auditoria"""
    
    async def log_action(
        self,
        user_id: str,
        user_email: str,
        action: str,
        target_type: str,
        target_id: Optional[str] = None,
        target_email: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> bool:
        """
        Registra ação administrativa
        
        Args:
            user_id: ID do usuário que executou a ação
            user_email: Email do usuário que executou
            action: Tipo de ação (ex: 'user_deleted', 'role_changed')
            target_type: Tipo do alvo ('user', 'company', 'quota', 'role', 'settings')
            target_id: ID do alvo afetado
            target_email: Email do alvo (se aplicável)
            details: Detalhes adicionais da ação (JSON)
            ip_address: IP de origem
            user_agent: User-Agent
        
        Returns:
            True se registrado com sucesso
        """
        try:
            db = get_supabase_service()
            
            log_data = {
                'user_id': user_id,
                'user_email': user_email,
                'action': action,
                'target_type': target_type,
                'target_id': target_id,
                'target_email': target_email,
                'details': details or {},
                'ip_address': ip_address,
                'user_agent': user_agent[:500] if user_agent else None,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            db.client.table('audit_logs').insert(log_data).execute()
            
            logger.info(f"📋 Audit log: {user_email} - {action} - {target_type} {target_id or ''}")
            return True
        
        except Exception as e:
            logger.error(f"❌ Erro ao registrar audit log: {e}", exc_info=True)
            return False
    
    async def get_logs(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[str] = None,
        action: Optional[str] = None,
        target_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict:
        """
        Busca logs de auditoria com filtros
        
        Args:
            limit: Quantidade máxima de resultados
            offset: Offset para paginação
            user_id: Filtrar por usuário que executou
            action: Filtrar por tipo de ação
            target_type: Filtrar por tipo de alvo
            start_date: Data inicial
            end_date: Data final
        
        Returns:
            {
                "logs": [...],
                "total": int,
                "limit": int,
                "offset": int
            }
        """
        try:
            db = get_supabase_service()
            
            # Query base
            query = db.client.table('audit_logs').select('*', count='exact')
            
            # Aplicar filtros
            if user_id:
                query = query.eq('user_id', user_id)
            
            if action:
                query = query.eq('action', action)
            
            if target_type:
                query = query.eq('target_type', target_type)
            
            if start_date:
                query = query.gte('created_at', start_date.isoformat())
            
            if end_date:
                query = query.lte('created_at', end_date.isoformat())
            
            # Ordenar e paginar
            result = query.order('created_at', desc=True)\
                .range(offset, offset + limit - 1)\
                .execute()
            
            return {
                'logs': result.data or [],
                'total': result.count or 0,
                'limit': limit,
                'offset': offset
            }
        
        except Exception as e:
            logger.error(f"❌ Erro ao buscar audit logs: {e}", exc_info=True)
            return {
                'logs': [],
                'total': 0,
                'limit': limit,
                'offset': offset
            }
    
    async def cleanup_old_logs(self, days: int = 90) -> int:
        """
        Remove logs antigos do banco
        
        Args:
            days: Remover logs com mais de N dias
        
        Returns:
            Quantidade de registros removidos
        """
        try:
            db = get_supabase_service()
            
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
            
            result = db.client.table('audit_logs')\
                .delete()\
                .lt('created_at', cutoff_date.isoformat())\
                .execute()
            
            count = len(result.data) if result.data else 0
            logger.info(f"🗑️ Removidos {count} audit logs antigos (>{days} dias)")
            return count
        
        except Exception as e:
            logger.error(f"❌ Erro ao limpar audit logs: {e}", exc_info=True)
            return 0
    
    async def get_stats(self) -> Dict:
        """
        Retorna estatísticas dos logs de auditoria
        
        Returns:
            {
                "total_logs": int,
                "logs_today": int,
                "logs_this_week": int,
                "top_actions": [{"action": str, "count": int}],
                "top_users": [{"user_email": str, "count": int}]
            }
        """
        try:
            db = get_supabase_service()
            
            # Total de logs
            total_result = db.client.table('audit_logs').select('*', count='exact').execute()
            total_logs = total_result.count or 0
            
            # Logs hoje
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            today_result = db.client.table('audit_logs')\
                .select('*', count='exact')\
                .gte('created_at', today_start.isoformat())\
                .execute()
            logs_today = today_result.count or 0
            
            # Logs esta semana
            week_start = datetime.now(timezone.utc) - timedelta(days=7)
            week_result = db.client.table('audit_logs')\
                .select('*', count='exact')\
                .gte('created_at', week_start.isoformat())\
                .execute()
            logs_this_week = week_result.count or 0
            
            return {
                'total_logs': total_logs,
                'logs_today': logs_today,
                'logs_this_week': logs_this_week,
                'top_actions': [],  # TODO: Implementar agregação
                'top_users': []  # TODO: Implementar agregação
            }
        
        except Exception as e:
            logger.error(f"❌ Erro ao buscar stats de auditoria: {e}", exc_info=True)
            return {
                'total_logs': 0,
                'logs_today': 0,
                'logs_this_week': 0,
                'top_actions': [],
                'top_users': []
            }


# Singleton global
_audit_service = None

def get_audit_service() -> AuditService:
    """Retorna instância singleton do AuditService"""
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditService()
    return _audit_service
