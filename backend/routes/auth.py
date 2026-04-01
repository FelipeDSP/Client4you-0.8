"""
Security Endpoints
Endpoints relacionados a segurança: login, 2FA, audit logs, etc.
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
import logging
from datetime import datetime, timezone

from security_utils import get_authenticated_user, require_role
from turnstile_service import get_turnstile_service
from anti_brute_force_service import get_anti_brute_force_service
from audit_service import get_audit_service
from supabase_service import get_supabase_service
from admin_access_control import get_admin_access_control

logger = logging.getLogger(__name__)

security_router = APIRouter(prefix="/api/security", tags=["security"])


# ========== MODELS ==========

class LoginValidationRequest(BaseModel):
    email: EmailStr
    turnstile_token: Optional[str] = None


class LoginAttemptRequest(BaseModel):
    email: EmailStr
    success: bool
    failure_reason: Optional[str] = None
    turnstile_token: Optional[str] = None


class AuditLogFilter(BaseModel):
    limit: int = 100
    offset: int = 0
    action: Optional[str] = None
    target_type: Optional[str] = None


class AdminReauthRequest(BaseModel):
    password: str


# ========== ADMIN ACCESS CONTROL ==========

@security_router.post("/admin/verify-access")
async def verify_admin_access(
    request: Request,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Verifica se admin pode acessar painel
    
    Checa:
    - IP whitelist
    - Registra acesso em audit logs
    """
    try:
        access_control = get_admin_access_control()
        
        # Verificar acesso (já loga automaticamente)
        await access_control.verify_admin_access(
            request=request,
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            company_id=auth_user.get('company_id')
        )
        
        return {
            "allowed": True,
            "message": "Acesso autorizado ao painel administrativo"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao verificar acesso admin: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao verificar acesso administrativo")


@security_router.post("/admin/reauth")
async def admin_reauth(
    request: Request,
    data: AdminReauthRequest,
    auth_user: dict = Depends(get_authenticated_user)
):
    """
    Re-autenticação administrativa
    
    Requer senha para confirmar identidade antes de acessar painel admin
    """
    try:
        db = get_supabase_service()
        
        # Tentar autenticar com Supabase
        try:
            result = db.client.auth.sign_in_with_password({
                "email": auth_user['email'],
                "password": data.password
            })
            
            if not result.user:
                raise Exception("Senha incorreta")
        
        except Exception as e:
            logger.warning(f"❌ Re-autenticação falhou para {auth_user['email']}: {e}")
            
            # Log de tentativa falha
            audit = get_audit_service()
            await audit.log_action(
                user_id=auth_user['user_id'],
                user_email=auth_user['email'],
                action='admin_reauth_failed',
                target_type='settings',
                details={'reason': 'Senha incorreta'},
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get('user-agent')
            )
            
            raise HTTPException(
                status_code=401,
                detail="Senha incorreta. Tente novamente."
            )
        
        # Log de re-autenticação bem-sucedida
        audit = get_audit_service()
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='admin_reauth_success',
            target_type='settings',
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )
        
        logger.info(f"✅ Re-autenticação bem-sucedida: {auth_user['email']}")
        
        return {
            "success": True,
            "message": "Re-autenticação bem-sucedida",
            "expires_in": 1800  # 30 minutos
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro na re-autenticação: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao processar re-autenticação")


# ========== LOGIN VALIDATION ENDPOINTS ==========

@security_router.post("/validate-login")
async def validate_login(
    request: Request,
    data: LoginValidationRequest
):
    """
    Valida se login é permitido (anti-brute force) e verifica Turnstile
    
    Deve ser chamado ANTES de tentar autenticar no Supabase
    """
    try:
        # Extrair IP e User-Agent
        ip_address = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        brute_force = get_anti_brute_force_service()
        turnstile = get_turnstile_service()
        
        # 1. Verificar anti-brute force
        allowed, reason, retry_after = await brute_force.check_login_allowed(
            data.email,
            ip_address
        )
        
        if not allowed:
            return {
                "allowed": False,
                "reason": reason,
                "retry_after": retry_after,
                "show_captcha": True
            }
        
        # 2. Verificar Turnstile se fornecido
        turnstile_valid = True
        turnstile_required = False
        
        if data.turnstile_token:
            turnstile_result = await turnstile.verify_token(
                data.turnstile_token,
                ip_address
            )
            turnstile_valid = turnstile_result.get("success", False)
            
            if not turnstile_valid:
                return {
                    "allowed": False,
                    "reason": "Verificação CAPTCHA falhou. Por favor, tente novamente.",
                    "retry_after": 0,
                    "show_captcha": True,
                    "turnstile_error": turnstile_result.get("error")
                }
        else:
            # Buscar tentativas recentes para decidir se exige Turnstile
            recent_attempts = await brute_force.get_recent_attempts(
                email=data.email,
                limit=10
            )
            
            # Contar falhas recentes
            recent_failures = sum(1 for a in recent_attempts if not a['success'])
            
            # Exigir Turnstile após 3 tentativas falhas
            if recent_failures >= 3:
                turnstile_required = True
        
        return {
            "allowed": True,
            "show_captcha": turnstile_required,
            "message": "Login permitido" if not turnstile_required else "Complete o CAPTCHA para continuar"
        }
    
    except Exception as e:
        logger.error(f"❌ Erro ao validar login: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao validar login")


@security_router.post("/record-login-attempt")
async def record_login_attempt(
    request: Request,
    data: LoginAttemptRequest
):
    """
    Registra tentativa de login
    
    Deve ser chamado APÓS tentativa de login (sucesso ou falha)
    """
    try:
        # Extrair IP e User-Agent
        ip_address = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        brute_force = get_anti_brute_force_service()
        turnstile = get_turnstile_service()
        
        # Validar Turnstile se fornecido
        turnstile_valid = None
        if data.turnstile_token:
            turnstile_result = await turnstile.verify_token(
                data.turnstile_token,
                ip_address
            )
            turnstile_valid = turnstile_result.get("success", False)
        
        # Registrar tentativa
        await brute_force.record_login_attempt(
            email=data.email,
            ip_address=ip_address,
            success=data.success,
            failure_reason=data.failure_reason,
            turnstile_token=data.turnstile_token,
            turnstile_valid=turnstile_valid,
            user_agent=user_agent
        )
        
        return {"success": True, "message": "Tentativa registrada"}
    
    except Exception as e:
        logger.error(f"❌ Erro ao registrar tentativa: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao registrar tentativa")


# ========== AUDIT LOGS ENDPOINTS (Admin only) ==========

@security_router.get("/audit-logs")
async def get_audit_logs(
    request: Request,
    auth_user: dict = Depends(require_role("super_admin")),
    limit: int = 100,
    offset: int = 0,
    action: Optional[str] = None,
    target_type: Optional[str] = None
):
    """
    Lista logs de auditoria (apenas super admins)
    
    Query params:
    - limit: Quantidade máxima (padrão: 100)
    - offset: Offset para paginação
    - action: Filtrar por ação
    - target_type: Filtrar por tipo de alvo
    """
    try:
        audit = get_audit_service()
        
        result = await audit.get_logs(
            limit=limit,
            offset=offset,
            action=action,
            target_type=target_type
        )
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao buscar audit logs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao buscar logs de auditoria")


@security_router.get("/audit-logs/stats")
async def get_audit_stats(
    request: Request,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Retorna estatísticas dos logs de auditoria (apenas super admins)
    """
    try:
        audit = get_audit_service()
        stats = await audit.get_stats()
        return stats
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao buscar stats de auditoria: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao buscar estatísticas")


# ========== LOGIN ATTEMPTS ENDPOINTS (Admin only) ==========

@security_router.get("/login-attempts")
async def get_login_attempts(
    request: Request,
    auth_user: dict = Depends(require_role("super_admin")),
    email: Optional[str] = None,
    limit: int = 100
):
    """
    Lista tentativas de login recentes (apenas super admins)
    
    Query params:
    - email: Filtrar por email
    - limit: Quantidade máxima (padrão: 100)
    """
    try:
        brute_force = get_anti_brute_force_service()
        attempts = await brute_force.get_recent_attempts(email=email, limit=limit)
        
        return {
            "attempts": attempts,
            "total": len(attempts)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao buscar tentativas de login: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao buscar tentativas de login")


# ========== HEALTH CHECK ==========

@security_router.get("/health")
async def health_check():
    """
    Health check endpoint - verifica se serviços estão funcionando
    """
    try:
        turnstile = get_turnstile_service()
        
        return {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "services": {
                "turnstile": "enabled" if turnstile.is_enabled() else "disabled",
                "anti_brute_force": "enabled",
                "audit": "enabled"
            }
        }
    except Exception as e:
        logger.error(f"❌ Health check falhou: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }
