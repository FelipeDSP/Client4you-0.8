"""
Security utilities for authentication, validation and sanitization
"""
import os
import logging
import ipaddress
import re
import html
import time
from typing import Optional, Dict, Any
from urllib.parse import urlparse
from fastapi import HTTPException, Request, Depends
from supabase import create_client
from supabase_service import get_supabase_service

logger = logging.getLogger(__name__)

# Cache para tokens validados (token_hash -> (user_data, expiry_time))
_token_cache: Dict[str, tuple[dict, float]] = {}
TOKEN_CACHE_TTL = 300  # 5 minutos

# ========== AUTHENTICATION ==========

async def get_authenticated_user(request: Request) -> dict:
    """
    Extrai e valida usuário autenticado do token JWT do Supabase.
    Retorna dict com user_id, company_id e role.
    
    Raises:
        HTTPException 401: Se token inválido ou ausente
        HTTPException 403: Se perfil não encontrado
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning("Authorization header missing or invalid")
        raise HTTPException(
            status_code=401, 
            detail="Token de autenticação não fornecido"
        )
    
    token = auth_header.replace("Bearer ", "")
    
    # Obter X-Session-Token do header (para verificação de sessão única)
    client_session_token = request.headers.get("X-Session-Token")
    
    # Verificar cache primeiro
    token_hash = hash(token)
    current_time = time.time()
    
    if token_hash in _token_cache:
        user_data, expiry = _token_cache[token_hash]
        if current_time < expiry:
            # Cache ainda válido, MAS precisa verificar session_token
            if client_session_token:
                # Verificar se o session_token ainda é válido no banco
                try:
                    db = get_supabase_service()
                    
                    profile = db.client.table('profiles')\
                        .select('session_token')\
                        .eq('id', user_data.get('user_id'))\
                        .single()\
                        .execute()
                    
                    db_session_token = profile.data.get('session_token') if profile.data else None
                    
                    logger.info(f"[Session Check - Cached] Client: {client_session_token[:15]}... | DB: {db_session_token[:15] if db_session_token else 'NONE'}...")
                    
                    if db_session_token and client_session_token != db_session_token:
                        logger.warning(f"Session token MISMATCH (cached) for user {user_data.get('user_id')}!")
                        raise HTTPException(
                            status_code=401, 
                            detail="SESSION_EXPIRED_OTHER_DEVICE"
                        )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.warning(f"Error checking session token: {e}")
            
            return user_data
        else:
            # Cache expirado, remover
            del _token_cache[token_hash]
    
    logger.info(f"Validating token for request to {request.url.path}")
    
    try:
        # Criar cliente Supabase
        supabase_url = os.environ.get('SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')
        jwt_secret = os.environ.get('SUPABASE_JWT_SECRET')
        
        supabase = get_supabase_service().client
        
        # Validar token e obter usuário COM VERIFICAÇÃO DE ASSINATURA
        try:
            import jwt as pyjwt
            from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
            import base64
            import httpx
            
            decoded = None
            
            # Obter header do token para verificar algoritmo
            try:
                token_header = pyjwt.get_unverified_header(token)
                alg = token_header.get('alg', 'HS256')
            except Exception:
                alg = 'HS256'
            
            # SEGURANÇA: Verificar assinatura do JWT
            if alg.startswith('ES') or alg.startswith('RS'):
                # Algoritmos assimétricos (ES256, RS256) - buscar JWKS do Supabase
                try:
                    jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
                    
                    # Cache simples da JWKS (em produção, usar cache real)
                    with httpx.Client(timeout=10) as client:
                        resp = client.get(jwks_url)
                        if resp.status_code == 200:
                            from jwt import PyJWKClient
                            jwks_client = PyJWKClient(jwks_url)
                            signing_key = jwks_client.get_signing_key_from_jwt(token)
                            
                            decoded = pyjwt.decode(
                                token,
                                signing_key.key,
                                algorithms=[alg],
                                audience="authenticated",
                                options={"verify_exp": True}
                            )
                            logger.debug(f"Token validado via JWKS com {alg}")
                        else:
                            logger.warning(f"Não foi possível obter JWKS: {resp.status_code}")
                            # Fallback: decodificar sem verificação
                            decoded = pyjwt.decode(token, options={"verify_signature": False})
                            logger.warning("Usando fallback sem verificação de assinatura")
                except Exception as e:
                    logger.warning(f"Erro ao validar com JWKS: {e}")
                    # Fallback: decodificar sem verificação
                    decoded = pyjwt.decode(token, options={"verify_signature": False})
                    logger.warning("Usando fallback sem verificação de assinatura")
                    
            elif jwt_secret:
                # Algoritmos simétricos (HS256) - usar JWT secret
                try:
                    secrets_to_try = [jwt_secret]
                    
                    # Tenta decodificar base64 se parecer ser base64
                    try:
                        padded = jwt_secret + '=' * (-len(jwt_secret) % 4)
                        decoded_secret = base64.b64decode(padded)
                        secrets_to_try.append(decoded_secret)
                    except Exception:
                        pass
                    
                    for secret in secrets_to_try:
                        try:
                            decoded = pyjwt.decode(
                                token, 
                                secret, 
                                algorithms=["HS256", "HS384", "HS512"],
                                audience="authenticated",
                                options={"verify_exp": True}
                            )
                            break
                        except pyjwt.InvalidAudienceError:
                            try:
                                decoded = pyjwt.decode(
                                    token, 
                                    secret, 
                                    algorithms=["HS256", "HS384", "HS512"],
                                    options={"verify_exp": True, "verify_aud": False}
                                )
                                break
                            except Exception:
                                continue
                        except Exception:
                            continue
                    
                    if not decoded:
                        raise HTTPException(status_code=401, detail="Token inválido")
                        
                except ExpiredSignatureError:
                    logger.warning("Token expirado")
                    raise HTTPException(status_code=401, detail="Token expirado. Faça login novamente.")
                except HTTPException:
                    raise
                except Exception as e:
                    logger.warning(f"Token inválido: {e}")
                    raise HTTPException(status_code=401, detail="Token inválido")
            else:
                # Fallback se JWT_SECRET não configurado (apenas desenvolvimento)
                logger.warning("SUPABASE_JWT_SECRET não configurado - verificação de assinatura desabilitada")
                decoded = pyjwt.decode(token, options={"verify_signature": False})
            
            user_id = decoded.get("sub")
            
            if not user_id:
                logger.error("No user_id in token")
                raise HTTPException(status_code=401, detail="Token inválido")
            
            logger.debug(f"Token validated for user_id: {user_id[:8]}...")
            
            # Buscar company_id do perfil usando service_role key
            # Também busca session_token para verificação de sessão única
            profile = supabase.table('profiles')\
                .select('company_id, email, full_name, session_token')\
                .eq('id', user_id)\
                .single()\
                .execute()
            
            if not profile.data:
                logger.error(f"Profile not found for user_id: {user_id}")
                raise HTTPException(status_code=403, detail="Perfil de usuário não encontrado")
            
            # Verificar session_token (sessão única por conta)
            # O token é enviado pelo frontend no header X-Session-Token
            client_session_token = request.headers.get("X-Session-Token")
            db_session_token = profile.data.get("session_token")
            
            logger.info(f"[Session Check] Client token: {client_session_token[:15] if client_session_token else 'NONE'}... | DB token: {db_session_token[:15] if db_session_token else 'NONE'}...")
            
            # Se o banco tem um token mas o cliente não enviou, é sessão antiga
            if db_session_token and not client_session_token:
                logger.warning(f"Session token missing from client for user {user_id}. DB has token but client didn't send.")
                # Não bloqueia sessões antigas sem token (compatibilidade)
                pass
            elif client_session_token and db_session_token:
                if client_session_token != db_session_token:
                    logger.warning(f"Session token MISMATCH for user {user_id}!")
                    raise HTTPException(
                        status_code=401, 
                        detail="SESSION_EXPIRED_OTHER_DEVICE"
                    )
                else:
                    logger.debug(f"Session token MATCH for user {user_id}")
            
            # Buscar roles do usuário
            roles_result = supabase.table('user_roles')\
                .select('role')\
                .eq('user_id', user_id)\
                .execute()
            
            # Extrair lista de roles
            user_roles = [r['role'] for r in (roles_result.data or [])]
            
            # Determinar role principal (prioridade: super_admin > company_owner > member)
            if 'super_admin' in user_roles:
                role = 'super_admin'
            elif 'company_owner' in user_roles:
                role = 'company_owner'
            elif 'member' in user_roles:
                role = 'member'
            else:
                role = 'user'  # Default se não tiver nenhuma role
            
            logger.info(f"Profile found: company_id={profile.data.get('company_id')}, role={role}, all_roles={user_roles}")
            
            user_data = {
                "user_id": user_id,
                "company_id": profile.data.get("company_id"),
                "role": role,
                "roles": user_roles,  # Todas as roles
                "email": profile.data.get("email") or decoded.get("email")
            }
            
            # Armazenar no cache
            _token_cache[token_hash] = (user_data, current_time + TOKEN_CACHE_TTL)
            
            return user_data
        
        except pyjwt.DecodeError as e:
            logger.error(f"JWT decode error: {e}")
            raise HTTPException(status_code=401, detail="Token malformado")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error authenticating user: {e}", exc_info=True)
        raise HTTPException(status_code=401, detail=f"Erro ao validar autenticação: {str(e)}")


def require_role(required_role: str):
    """
    Decorator/dependency para verificar role do usuário.
    
    Roles suportadas:
    - super_admin: Acesso total ao sistema
    - company_owner: Dono da empresa
    - member: Membro da empresa
    - user: Usuário padrão
    
    Usage:
        @api_router.get("/admin/endpoint")
        async def admin_endpoint(auth_user: dict = Depends(require_role("super_admin"))):
            ...
    """
    async def role_checker(request: Request) -> dict:
        auth_user = await get_authenticated_user(request)
        
        # Hierarquia de roles
        role_hierarchy = {
            "super_admin": 4,
            "company_owner": 3,
            "member": 2,
            "user": 1
        }
        
        user_role = auth_user.get("role", "user")
        user_level = role_hierarchy.get(user_role, 0)
        required_level = role_hierarchy.get(required_role, 999)
        
        logger.info(f"Role check: user={user_role} (level {user_level}), required={required_role} (level {required_level})")
        
        if user_level < required_level:
            logger.warning(f"Access denied for user {auth_user.get('email')} with role {user_role}, required: {required_role}")
            raise HTTPException(
                status_code=403,
                detail=f"Acesso negado. Requer permissão: {required_role}"
            )
        
        return auth_user
    
    return role_checker


# ========== FILE UPLOAD VALIDATION ==========

def validate_file_upload(content: bytes, filename: str, max_size_mb: int = 10) -> tuple[bool, Optional[str]]:
    """
    Valida arquivo de upload para prevenir XXE, CSV injection, etc.
    
    Returns:
        (is_valid, error_message)
    """
    max_size = max_size_mb * 1024 * 1024
    
    # 1. Validar tamanho
    if len(content) > max_size:
        return False, f"Arquivo muito grande. Máximo: {max_size_mb}MB"
    
    # 2. Validar extensão
    allowed_extensions = ['.xlsx', '.xls', '.csv']
    file_ext = filename.lower().split('.')[-1] if '.' in filename else ''
    if f'.{file_ext}' not in allowed_extensions:
        return False, f"Tipo de arquivo não permitido. Use: {', '.join(allowed_extensions)}"
    
    # 3. Sanitizar nome do arquivo
    safe_filename = re.sub(r'[^a-zA-Z0-9._-]', '', filename)
    if not safe_filename:
        return False, "Nome de arquivo inválido"
    
    return True, None


def sanitize_csv_value(value: Any) -> str:
    """
    Sanitiza valor para prevenir CSV Injection.
    Remove caracteres perigosos do início que podem executar fórmulas.
    """
    if value is None:
        return ""
    
    str_value = str(value).strip()
    
    if not str_value:
        return ""
    
    # Caracteres perigosos no início de células CSV/Excel
    dangerous_starts = ['=', '+', '-', '@', '\t', '\r', '\n']
    
    # Se começa com caractere perigoso, adiciona ' para neutralizar
    # Mas não quebrar números negativos ou telefones com +
    try:
        float(str_value)
        return str_value  # É número válido, não sanitizar
    except ValueError:
        pass
    
    if str_value[0] in dangerous_starts:
        str_value = "'" + str_value
    
    # Remove quebras de linha que podem quebrar a estrutura CSV
    str_value = str_value.replace('\n', ' ').replace('\r', ' ')
    
    return str_value


# ========== URL VALIDATION (SSRF PREVENTION) ==========

def validate_media_url(url: str) -> tuple[bool, Optional[str]]:
    """
    Valida URL de mídia para prevenir SSRF.
    Bloqueia IPs privados, localhost, cloud metadata, etc.
    
    Returns:
        (is_valid, error_message)
    """
    if not url:
        return False, "URL não fornecida"
    
    try:
        parsed = urlparse(url)
        
        # 1. Apenas HTTP/HTTPS
        if parsed.scheme not in ['http', 'https']:
            return False, "Apenas URLs HTTP/HTTPS são permitidas"
        
        # 2. Validar hostname
        hostname = parsed.hostname
        if not hostname:
            return False, "URL inválida"
        
        # 3. Lista de hostnames bloqueados
        blocked_hostnames = [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            'metadata.google.internal',  # GCP metadata
            '169.254.169.254',  # AWS/Azure metadata
            'metadata.azure.com',
            'metadata',
        ]
        
        hostname_lower = hostname.lower()
        if hostname_lower in blocked_hostnames:
            return False, "Hostname bloqueado por política de segurança"
        
        # 4. Bloquear IPs privados e reservados
        try:
            # Tenta tratar como IP
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False, "IPs privados/reservados não são permitidos"
        except ValueError:
            # Não é IP, é hostname - validar através de DNS
            import socket
            try:
                resolved_ip = socket.gethostbyname(hostname)
                ip = ipaddress.ip_address(resolved_ip)
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    return False, "URL resolve para IP privado/reservado"
            except (socket.gaierror, ValueError):
                # Não conseguiu resolver ou IP inválido
                pass
        
        # 5. Validar extensão de arquivo (whitelist)
        path = parsed.path.lower()
        allowed_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx']
        
        # URL pode não ter extensão (ex: CDN com query string)
        # Então validamos apenas se tiver extensão clara
        if '.' in path:
            has_valid_ext = any(path.endswith(ext) for ext in allowed_extensions)
            if not has_valid_ext:
                return False, f"Extensão de arquivo não permitida. Use: {', '.join(allowed_extensions)}"
        
        # 6. Bloquear caracteres suspeitos que podem indicar bypass
        suspicious_chars = ['@', '#']
        if any(char in url for char in suspicious_chars):
            return False, "URL contém caracteres suspeitos"
        
        return True, None
    
    except Exception as e:
        logger.warning(f"Error validating URL {url}: {e}")
        return False, "URL inválida"


# ========== TEMPLATE VARIABLE SANITIZATION ==========

def sanitize_template_value(value: Any, max_length: int = 500) -> str:
    """
    Sanitiza valores antes de substituição em templates de mensagem.
    Previne command injection e XSS.
    """
    if value is None:
        return ""
    
    # Converte para string
    str_value = str(value)
    
    # Remove caracteres perigosos para command injection
    dangerous_chars = ['`', '|', '>', '<', '$', ';', '&', '\n', '\r', '\0']
    for char in dangerous_chars:
        str_value = str_value.replace(char, '')
    
    # HTML escape para prevenir XSS se renderizado em HTML
    str_value = html.escape(str_value)
    
    # Limita tamanho para prevenir DoS
    if len(str_value) > max_length:
        str_value = str_value[:max_length]
    
    return str_value


# ========== ERROR HANDLING ==========

def handle_error(
    e: Exception, 
    user_message: str = "Erro ao processar requisição",
    log_full_error: bool = True
) -> HTTPException:
    """
    Trata erro de forma segura:
    - Log detalhado internamente
    - Mensagem genérica para o usuário (em produção)
    
    Returns:
        HTTPException pronta para raise
    """
    # Log completo para debug interno
    if log_full_error:
        logger.error(f"Error: {str(e)}", exc_info=True)
    
    # Se já é HTTPException, retorna como está
    if isinstance(e, HTTPException):
        return e
    
    # Em produção, mensagens genéricas
    is_production = os.getenv("ENVIRONMENT", "development").lower() == "production"
    
    if is_production:
        return HTTPException(status_code=500, detail=user_message)
    else:
        # Em desenvolvimento, pode mostrar mais detalhes
        return HTTPException(status_code=500, detail=f"{user_message}: {str(e)}")


# ========== OWNERSHIP VALIDATION ==========

async def validate_campaign_ownership(
    campaign_id: str,
    company_id: str,
    db
) -> dict:
    """
    Valida se campanha pertence à empresa.
    Previne IDOR.
    
    Returns:
        campaign_data dict
    
    Raises:
        HTTPException 404: Campanha não encontrada
        HTTPException 403: Acesso negado (não é dono)
    """
    campaign_data = await db.get_campaign(campaign_id)
    
    if not campaign_data:
        raise HTTPException(status_code=404, detail="Campanha não encontrada")
    
    if campaign_data.get("company_id") != company_id:
        raise HTTPException(
            status_code=403,
            detail="Acesso negado. Esta campanha não pertence à sua empresa."
        )
    
    return campaign_data


# ========== QUOTA VALIDATION ==========

async def validate_quota_for_action(
    user_id: str,
    action: str,
    required_plan: Optional[list] = None,
    db = None
) -> None:
    """
    Valida se usuário tem quota/plano para realizar ação.
    
    Args:
        user_id: ID do usuário
        action: Nome da ação (ex: "create_campaign", "send_message")
        required_plan: Lista de planos permitidos (ex: ["Pro", "Enterprise"])
        db: Instância do banco de dados
    
    Raises:
        HTTPException 403: Quota insuficiente ou plano inadequado
        HTTPException 402: Plano expirado
    """
    from datetime import datetime, timezone
    
    if not db:
        from supabase_service import get_supabase_service
        db = get_supabase_service()
    
    # Buscar quota do usuário
    quota = await db.get_user_quota(user_id)
    if not quota:
        raise HTTPException(
            status_code=403,
            detail="Quota não encontrada. Entre em contato com o suporte."
        )
    
    # VERIFICAR SE O PLANO EXPIROU
    plan_expires_at = quota.get("plan_expires_at")
    if plan_expires_at:
        try:
            # Parse da data de expiração
            if isinstance(plan_expires_at, str):
                # Remover timezone info se presente para simplificar
                expiration_str = plan_expires_at.replace('Z', '+00:00')
                if '+' in expiration_str:
                    expiration_str = expiration_str.split('+')[0]
                expiration_date = datetime.fromisoformat(expiration_str)
            else:
                expiration_date = plan_expires_at
            
            now = datetime.now(timezone.utc)
            
            if expiration_date < now:
                logger.warning(f"Plano expirado para usuário {user_id}. Expirou em: {plan_expires_at}")
                raise HTTPException(
                    status_code=402,
                    detail="Seu plano expirou. Renove sua assinatura para continuar usando a plataforma."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Erro ao verificar expiração do plano: {e}")
            # Em caso de erro de parse, não bloqueia
    
    # Verificar plano se necessário
    if required_plan:
        # Compatível com plan_type OU plan_name (campos diferentes nas migrations)
        user_plan = quota.get("plan_type", quota.get("plan_name", quota.get("plan", "sem_plano")))
        # Normalizar para comparação (basico, intermediario, avancado)
        user_plan_normalized = user_plan.lower() if user_plan else "sem_plano"
        
        # Converter required_plan para lowercase para comparação
        required_plan_lower = [p.lower() for p in required_plan]
        
        if user_plan_normalized not in required_plan_lower:
            # Mapear nomes amigáveis para exibição
            plan_display_names = {
                'demo': 'Demo',
                'basico': 'Básico',
                'intermediario': 'Intermediário',
                'avancado': 'Avançado'
            }
            user_plan_display = plan_display_names.get(user_plan_normalized, user_plan_normalized.title())
            required_display = ', '.join([plan_display_names.get(p, p.title()) for p in required_plan_lower])
            raise HTTPException(
                status_code=403,
                detail=f"Esta funcionalidade está disponível apenas para os planos: {required_display}. "
                       f"Seu plano atual: {user_plan_display}. Faça upgrade para acessar."
            )
    
    # Verificar limite de uso
    quota_check = await db.check_quota(user_id, action)
    if not quota_check.get("allowed", False):
        reason = quota_check.get("reason", "Limite atingido")
        raise HTTPException(
            status_code=403,
            detail=f"Limite de uso atingido: {reason}. Faça upgrade ou aguarde renovação da quota."
        )
