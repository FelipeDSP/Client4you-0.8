"""
Cloudflare Turnstile Service
Validação de tokens Turnstile para prevenção de bots
"""
import os
import httpx
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class TurnstileService:
    """Serviço de validação do Cloudflare Turnstile"""
    
    VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    
    def __init__(self):
        self.secret_key = os.getenv('TURNSTILE_SECRET_KEY')
        if not self.secret_key:
            logger.warning("⚠️ TURNSTILE_SECRET_KEY não configurada - validação desabilitada")
    
    async def verify_token(self, token: str, ip_address: Optional[str] = None) -> Dict:
        """
        Verifica token do Turnstile
        
        Args:
            token: Token retornado pelo widget Turnstile no frontend
            ip_address: IP do usuário (opcional, mas recomendado)
        
        Returns:
            {
                "success": bool,
                "error": str (se falhou),
                "challenge_ts": str (timestamp do desafio),
                "hostname": str (hostname do desafio)
            }
        """
        if not self.secret_key:
            # Modo desenvolvimento: sempre sucesso se não configurado
            logger.warning("⚠️ Turnstile desabilitado - aceitando sem validação")
            return {
                "success": True,
                "dev_mode": True,
                "message": "Turnstile não configurado"
            }
        
        if not token:
            return {
                "success": False,
                "error": "Token Turnstile não fornecido"
            }
        
        try:
            # Preparar payload
            payload = {
                "secret": self.secret_key,
                "response": token
            }
            
            # Adicionar IP se fornecido (recomendado pelo Cloudflare)
            if ip_address:
                payload["remoteip"] = ip_address
            
            # Fazer requisição ao Cloudflare
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    self.VERIFY_URL,
                    data=payload
                )
                
                if response.status_code != 200:
                    logger.error(f"Turnstile API retornou {response.status_code}")
                    return {
                        "success": False,
                        "error": f"Erro na API do Turnstile: {response.status_code}"
                    }
                
                result = response.json()
                
                # Log do resultado
                if result.get("success"):
                    logger.info(f"✅ Token Turnstile válido - hostname: {result.get('hostname')}")
                else:
                    error_codes = result.get("error-codes", [])
                    logger.warning(f"❌ Token Turnstile inválido - errors: {error_codes}")
                
                return result
        
        except httpx.TimeoutException:
            logger.error("⏱️ Timeout ao validar token Turnstile")
            return {
                "success": False,
                "error": "Timeout ao validar CAPTCHA"
            }
        except Exception as e:
            logger.error(f"❌ Erro ao validar token Turnstile: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Erro interno ao validar CAPTCHA: {str(e)}"
            }
    
    def is_enabled(self) -> bool:
        """Verifica se o Turnstile está habilitado"""
        return bool(self.secret_key)


# Singleton global
_turnstile_service = None

def get_turnstile_service() -> TurnstileService:
    """Retorna instância singleton do TurnstileService"""
    global _turnstile_service
    if _turnstile_service is None:
        _turnstile_service = TurnstileService()
    return _turnstile_service
