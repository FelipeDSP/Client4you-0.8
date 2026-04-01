"""
Reverse proxy for N8N → OpenAI with per-company API key injection.
Intercepts requests, replaces credentials, and streams responses.
"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import logging
from helpers import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/openai", tags=["openai_proxy"])

OPENAI_API_URL = "https://api.openai.com/v1"

@router.api_route("/{company_id}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def openai_proxy(company_id: str, path: str, request: Request):
    """
    Proxy reverso para interceptar requisições do N8N para a OpenAI.
    Isso permite que o N8N use uma Base URL dinâmica (ex: /openai/company_123/chat/completions)
    e o proxy injete a API Key verdadeira dessa empresa puxada do Supabase antes de enviar à OpenAI.
    """
    try:
        db = get_db()
        
        # 1. Puxar as configurações do Agente da Empresa
        agent_config = await db.get_agent_config(company_id)
        
        if not agent_config:
            raise HTTPException(status_code=404, detail="Configuração do agente não encontrada para esta empresa.")
        
        api_key = agent_config.get("openai_api_key")
        if not api_key:
            raise HTTPException(status_code=400, detail="Esta empresa não configurou uma Chave da OpenAI.")
            
        # 2. Preparar os headers e injetar a Chave de API da empresa
        headers = dict(request.headers)
        headers.pop("host", None) # Removemos o host original
        headers["authorization"] = f"Bearer {api_key}" # Substitui a credencial fake do N8N pela chave real
        
        # 3. Ler o corpo da requisição do N8N
        body = await request.body()
        
        url = f"{OPENAI_API_URL}/{path}"
        
        # 4. Encaminhar para a OpenAI de forma Assíncrona via httpx
        # Usando async with para garantir que o client seja sempre fechado
        async with httpx.AsyncClient() as client:
            method = request.method
            
            # Faz a chamada para a OpenAI
            req = client.build_request(method, url, headers=headers, content=body)
            response = await client.send(req, stream=True)
            
            # 5. Ler toda a resposta e devolver (não pode stream com async with)
            response_body = await response.aread()
            
            return StreamingResponse(
                iter([response_body]),
                status_code=response.status_code,
                headers=dict(response.headers)
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro no Proxy OpenAI para empresa {company_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro interno no proxy da OpenAI")
