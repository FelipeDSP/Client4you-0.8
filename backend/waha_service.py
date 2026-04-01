import httpx
import logging
import base64
from typing import Optional, Dict, Any
import re
from security_utils import validate_media_url, sanitize_template_value

logger = logging.getLogger(__name__)


def normalize_phone(phone: str) -> str:
    """Normalize phone number to WhatsApp format (only digits with country code)"""
    # Remove all non-digit characters
    digits = re.sub(r'\D', '', phone)
    
    # If starts with 0, remove it (ex: 011999...)
    if digits.startswith('0'):
        digits = digits[1:]
    
    # Add Brazil country code if not present and length seems like a local number
    if len(digits) <= 11 and not digits.startswith('55'):
        digits = '55' + digits
    
    return digits


class WahaService:
    def __init__(self, waha_url: str, api_key: str, session_name: str = "default"):
        self.waha_url = waha_url.rstrip('/')
        self.api_key = api_key
        self.session_name = session_name
        self.headers = {
            "Content-Type": "application/json",
            "X-Api-Key": api_key
        }
    
    # --- MÉTODOS DE SESSÃO ---

    async def start_session(self) -> Dict[str, Any]:
        """Inicia (ou cria) a sessão no WAHA"""
        try:
            logger.info(f"🔌 WahaService.start_session - session_name: {self.session_name}")
            payload = {"name": self.session_name, "config": {"webhooks": []}}
            logger.info(f"🔌 Payload para criar sessão: {payload}")
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.waha_url}/api/sessions",
                    headers=self.headers,
                    json=payload
                )
                logger.info(f"🔌 Resposta criar sessão: {response.status_code}")
                
                if response.status_code in [201, 409]:
                    start_response = await client.post(
                        f"{self.waha_url}/api/sessions/{self.session_name}/start",
                        headers=self.headers
                    )
                    logger.info(f"🔌 Resposta start sessão: {start_response.status_code}")
                    return {"success": True, "status": "STARTING", "session_name": self.session_name}
                
                return {"success": False, "error": f"Erro WAHA: {response.status_code}"}
        except Exception as e:
            logger.error(f"Erro ao iniciar sessão: {e}")
            return {"success": False, "error": str(e)}

    async def stop_session(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f"{self.waha_url}/api/sessions/{self.session_name}/stop",
                    headers=self.headers
                )
                return {"success": response.status_code == 200}
        except Exception as e:
            logger.error(f"Erro ao parar sessão: {e}")
            return {"success": False, "error": str(e)}

    async def logout_session(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f"{self.waha_url}/api/sessions/{self.session_name}/logout",
                    headers=self.headers
                )
                return {"success": response.status_code == 200}
        except Exception as e:
            logger.error(f"Erro ao deslogar sessão: {e}")
            return {"success": False, "error": str(e)}

    async def get_qr_code(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(
                    f"{self.waha_url}/api/screenshot?session={self.session_name}",
                    headers=self.headers
                )
                
                if response.status_code == 200:
                    if response.content[:4] == b'\x89PNG':
                        b64_img = base64.b64encode(response.content).decode('utf-8')
                        return {
                            "success": True, 
                            "image": f"data:image/png;base64,{b64_img}"
                        }
                
                if response.status_code == 404:
                    return {"success": False, "error": "Sessão não encontrada ou motor ainda iniciando."}
                
                return {"success": False, "error": f"QR Code pendente (Status {response.status_code})"}
                
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def check_connection(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.waha_url}/api/sessions/{self.session_name}",
                    headers=self.headers
                )
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        status = data.get("status", "unknown")
                        is_connected = status == "WORKING" or status == "CONNECTED"
                        return {
                            "connected": is_connected,
                            "status": status,
                            "me": data.get("me", {})
                        }
                    except Exception:
                        return {"connected": False, "status": "error_parsing"}
                return {"connected": False, "status": "error", "error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"connected": False, "status": "error", "error": str(e)}

    # --- MÉTODO MELHORADO ---
    async def check_number_exists(self, phone: str) -> bool:
        """Verifica se o número tem WhatsApp registrado (Robusto)"""
        try:
            formatted_phone = normalize_phone(phone)
            
            # Validação básica de comprimento (Brasil: 10 a 13 dígitos)
            if len(formatted_phone) < 10 or len(formatted_phone) > 13:
                return False

            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(
                    f"{self.waha_url}/api/contacts/check-exists",
                    headers=self.headers,
                    params={
                        "phone": formatted_phone,
                        "session": self.session_name
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    # Verifica múltiplos campos possíveis para compatibilidade
                    # WAHA Core usa 'exists', alguns forks usam 'numberExists' ou 'valid'
                    return (
                        data.get("exists") is True or 
                        data.get("numberExists") is True or 
                        data.get("valid") is True or
                        data.get("status") == 200
                    )
                return False
        except Exception as e:
            logger.error(f"Erro ao validar número {phone}: {e}")
            return False

    async def send_text_message(self, phone: str, message: str) -> Dict[str, Any]:
        chat_id = f"{normalize_phone(phone)}@c.us"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.waha_url}/api/sendText",
                    headers=self.headers,
                    json={"chatId": chat_id, "text": message, "session": self.session_name}
                )
                if response.status_code in [200, 201]:
                    return {"success": True, "data": response.json()}
                return {"success": False, "error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def send_image_message(self, phone: str, caption: str, image_url: Optional[str] = None, image_base64: Optional[str] = None) -> Dict[str, Any]:
        chat_id = f"{normalize_phone(phone)}@c.us"
        try:
            logger.info(f"📸 Enviando imagem para {phone}")
            logger.info(f"📸 URL da imagem: {image_url}")
            logger.info(f"📸 Caption: {caption[:50]}...")
            
            payload = {"chatId": chat_id, "caption": caption, "session": self.session_name}
            
            if image_url:
                # Detectar mimetype pela extensão da URL
                mimetype = "image/png"
                if image_url.lower().endswith('.jpg') or image_url.lower().endswith('.jpeg'):
                    mimetype = "image/jpeg"
                elif image_url.lower().endswith('.gif'):
                    mimetype = "image/gif"
                elif image_url.lower().endswith('.webp'):
                    mimetype = "image/webp"
                
                # IMPORTANTE: WAHA GOWS precisa do mimetype no payload
                payload["file"] = {
                    "url": image_url,
                    "mimetype": mimetype
                }
                logger.info(f"📸 Mimetype detectado: {mimetype}")
            elif image_base64:
                payload["file"] = {"data": image_base64}
            else:
                logger.error("📸 Nenhuma imagem fornecida!")
                return {"success": False, "error": "No image provided"}
            
            logger.info(f"📸 Payload: {payload}")
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.waha_url}/api/sendImage",
                    headers=self.headers,
                    json=payload
                )
                logger.info(f"📸 Resposta WAHA: status={response.status_code}")
                
                if response.status_code in [200, 201]:
                    logger.info(f"📸 Imagem enviada com sucesso!")
                    return {"success": True, "data": response.json()}
                else:
                    error_body = response.text
                    logger.error(f"📸 Erro ao enviar imagem: {response.status_code} - {error_body}")
                    return {"success": False, "error": f"HTTP {response.status_code}: {error_body}"}
        except Exception as e:
            logger.error(f"📸 Exceção ao enviar imagem: {e}")
            return {"success": False, "error": str(e)}
    
    async def send_document_message(self, phone: str, caption: str, document_url: Optional[str] = None, document_base64: Optional[str] = None, filename: str = "document") -> Dict[str, Any]:
        chat_id = f"{normalize_phone(phone)}@c.us"
        try:
            payload = {
                "chatId": chat_id, 
                "caption": caption, 
                "session": self.session_name,
                "file": {"filename": filename}
            }
            if document_url:
                payload["file"]["url"] = document_url
            elif document_base64:
                payload["file"]["data"] = document_base64
            else:
                return {"success": False, "error": "No document provided"}
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.waha_url}/api/sendFile",
                    headers=self.headers,
                    json=payload
                )
                if response.status_code in [200, 201]:
                    return {"success": True, "data": response.json()}
                return {"success": False, "error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

def replace_variables(template: str, data: Dict[str, Any]) -> str:
    result = template
    for key, value in data.items():
        safe_value = sanitize_template_value(value)
        # Substituir variante exata e variantes de case em uma única iteração
        for variant in [key, key.lower(), key.upper(), key.capitalize()]:
            placeholder = "{" + variant + "}"
            result = result.replace(placeholder, safe_value)
    return result