"""
Anti-Brute Force Service
Sistema de prevenção de ataques de força bruta em login
"""
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple
from supabase_service import get_supabase_service

logger = logging.getLogger(__name__)


class AntiBruteForceService:
    """Serviço de proteção contra brute force"""
    
    def __init__(self):
        # Configurações (podem ser sobrescritas via env vars)
        self.max_attempts = int(os.getenv('LOGIN_MAX_ATTEMPTS', '5'))
        self.lockout_duration = int(os.getenv('LOGIN_LOCKOUT_DURATION', '1800'))  # 30 min
        self.window_duration = int(os.getenv('LOGIN_WINDOW_DURATION', '900'))  # 15 min
        
        logger.info(f"🔒 Anti-Brute Force configurado: {self.max_attempts} tentativas em {self.window_duration}s, lockout de {self.lockout_duration}s")
    
    async def check_login_allowed(self, email: str, ip_address: str) -> Tuple[bool, Optional[str], Optional[int]]:
        """
        Verifica se o login é permitido para este email/IP
        
        Returns:
            (allowed: bool, reason: str, retry_after: int)
            - allowed: True se pode tentar login
            - reason: Motivo se bloqueado
            - retry_after: Segundos até poder tentar novamente
        """
        try:
            db = get_supabase_service()
            
            # Buscar tentativas recentes (últimos 15 minutos)
            window_start = datetime.now(timezone.utc) - timedelta(seconds=self.window_duration)
            
            # Buscar por email E IP (mais rigoroso)
            attempts = db.client.table('login_attempts')\
                .select('*')\
                .eq('email', email)\
                .eq('ip_address', ip_address)\
                .eq('success', False)\
                .gte('created_at', window_start.isoformat())\
                .order('created_at', desc=True)\
                .execute()
            
            failed_attempts = attempts.data if attempts.data else []
            
            # Contar tentativas falhadas
            failed_count = len(failed_attempts)
            
            if failed_count >= self.max_attempts:
                # Calcular tempo restante de lockout
                last_attempt = datetime.fromisoformat(failed_attempts[0]['created_at'].replace('Z', '+00:00'))
                lockout_until = last_attempt + timedelta(seconds=self.lockout_duration)
                now = datetime.now(timezone.utc).replace(tzinfo=last_attempt.tzinfo)
                
                if now < lockout_until:
                    retry_after = int((lockout_until - now).total_seconds())
                    logger.warning(f"🚫 Login bloqueado - {email} ({ip_address}) - {failed_count} tentativas - retry em {retry_after}s")
                    return False, f"Conta temporariamente bloqueada após {self.max_attempts} tentativas falhas", retry_after
                else:
                    # Lockout expirou, pode tentar novamente
                    logger.info(f"🔓 Lockout expirado para {email} ({ip_address})")
                    return True, None, None
            
            # Permitido
            return True, None, None
        
        except Exception as e:
            logger.error(f"❌ Erro ao verificar anti-brute force: {e}", exc_info=True)
            # Em caso de erro, permitir (fail-open para não bloquear sistema)
            return True, None, None
    
    async def record_login_attempt(
        self, 
        email: str, 
        ip_address: str,
        success: bool,
        failure_reason: Optional[str] = None,
        turnstile_token: Optional[str] = None,
        turnstile_valid: Optional[bool] = None,
        user_agent: Optional[str] = None
    ) -> None:
        """
        Registra tentativa de login
        
        Args:
            email: Email do usuário
            ip_address: IP da requisição
            success: True se login bem-sucedido
            failure_reason: Motivo da falha (se aplicável)
            turnstile_token: Token do Turnstile (se usado)
            turnstile_valid: Se token Turnstile era válido
            user_agent: User-Agent do browser
        """
        try:
            db = get_supabase_service()
            
            attempt_data = {
                'email': email,
                'ip_address': ip_address,
                'success': success,
                'failure_reason': failure_reason,
                'turnstile_token': turnstile_token[:50] if turnstile_token else None,  # Apenas início
                'turnstile_valid': turnstile_valid,
                'user_agent': user_agent[:500] if user_agent else None,  # Limitar tamanho
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            db.client.table('login_attempts').insert(attempt_data).execute()
            
            if success:
                logger.info(f"✅ Login bem-sucedido: {email} ({ip_address})")
            else:
                logger.warning(f"❌ Login falhou: {email} ({ip_address}) - {failure_reason}")
        
        except Exception as e:
            logger.error(f"❌ Erro ao registrar tentativa de login: {e}", exc_info=True)
    
    async def get_recent_attempts(self, email: Optional[str] = None, limit: int = 100) -> list:
        """
        Busca tentativas recentes de login
        
        Args:
            email: Filtrar por email (opcional)
            limit: Quantidade máxima de resultados
        
        Returns:
            Lista de tentativas
        """
        try:
            db = get_supabase_service()
            
            query = db.client.table('login_attempts')\
                .select('*')\
                .order('created_at', desc=True)\
                .limit(limit)
            
            if email:
                query = query.eq('email', email)
            
            result = query.execute()
            return result.data if result.data else []
        
        except Exception as e:
            logger.error(f"❌ Erro ao buscar tentativas de login: {e}", exc_info=True)
            return []
    
    async def cleanup_old_attempts(self, days: int = 7) -> int:
        """
        Remove tentativas antigas do banco
        
        Args:
            days: Remover tentativas com mais de N dias
        
        Returns:
            Quantidade de registros removidos
        """
        try:
            db = get_supabase_service()
            
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
            
            result = db.client.table('login_attempts')\
                .delete()\
                .lt('created_at', cutoff_date.isoformat())\
                .execute()
            
            count = len(result.data) if result.data else 0
            logger.info(f"🗑️ Removidas {count} tentativas de login antigas (>{days} dias)")
            return count
        
        except Exception as e:
            logger.error(f"❌ Erro ao limpar tentativas antigas: {e}", exc_info=True)
            return 0


# Singleton global
_anti_brute_force_service = None

def get_anti_brute_force_service() -> AntiBruteForceService:
    """Retorna instância singleton do AntiBruteForceService"""
    global _anti_brute_force_service
    if _anti_brute_force_service is None:
        _anti_brute_force_service = AntiBruteForceService()
    return _anti_brute_force_service
