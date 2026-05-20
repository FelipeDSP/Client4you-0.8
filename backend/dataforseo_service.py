"""
DataForSEO — busca de leads no Google Maps (modo Live Advanced, síncrono).

Credenciais ficam em variáveis de ambiente (infraestrutura do SaaS), não no
banco e não por empresa:
    DATAFORSEO_LOGIN
    DATAFORSEO_PASSWORD

Usa httpx em HTTP/1.1 (mesmo padrão do firecrawl_service) para evitar os
RemoteProtocolError de connection-pool que tivemos com HTTP/2.
"""
import os
import base64
import logging
import httpx

logger = logging.getLogger(__name__)

DATAFORSEO_URL = "https://api.dataforseo.com/v3/serp/google/maps/live/advanced"

# DataForSEO retorna no máximo 700 resultados por requisição. A cobrança é por
# "página" de 100 resultados (depth 700 = 7 páginas faturadas).
MAX_DEPTH = 700


class DataForSEOError(Exception):
    """Erro de configuração ou da API DataForSEO."""

    def __init__(self, message: str, *, configuration: bool = False):
        super().__init__(message)
        self.configuration = configuration


def _credentials() -> str:
    login = os.getenv("DATAFORSEO_LOGIN")
    password = os.getenv("DATAFORSEO_PASSWORD")
    if not login or not password:
        logger.error("DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD ausentes — busca desabilitada")
        raise DataForSEOError("Serviço de busca não configurado", configuration=True)
    return base64.b64encode(f"{login}:{password}".encode()).decode()


def _normalize_item(item: dict, fallback_category: str) -> dict:
    """Mapeia um item do DataForSEO para as colunas da tabela `leads`."""
    rating = item.get("rating") or {}
    return {
        "name": item.get("title"),
        "phone": item.get("phone") or None,
        "address": item.get("address") or None,
        "website": item.get("url") or None,
        "rating": rating.get("value") if isinstance(rating, dict) else None,
        "reviews_count": (rating.get("votes_count") if isinstance(rating, dict) else None) or 0,
        "category": item.get("category") or fallback_category,
        "has_whatsapp": False,
        "email": None,
        "has_email": False,
    }


async def search_google_maps(query: str, location: str, depth: int) -> list[dict]:
    """
    Busca estabelecimentos no Google Maps via DataForSEO.

    Retorna lista de dicts já no formato das colunas de `leads` (sem company_id
    nem search_id — quem chama preenche).

    Levanta DataForSEOError em falha de configuração ou erro da API.
    """
    credentials = _credentials()
    depth = max(1, min(int(depth), MAX_DEPTH))

    keyword = f"{query.strip()} em {location.strip()}"
    payload = [{
        "keyword": keyword,
        "location_name": "Brazil",
        "language_name": "Portuguese",
        "depth": depth,
    }]

    logger.info(f"DataForSEO: buscando '{keyword}' (depth={depth})")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                DATAFORSEO_URL,
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        data = resp.json()
    except Exception as e:
        logger.error(f"DataForSEO fetch falhou: {type(e).__name__}: {e}")
        raise DataForSEOError("Serviço de busca temporariamente indisponível")

    task = (data.get("tasks") or [None])[0]
    if not task or task.get("status_code") != 20000:
        msg = (task or {}).get("status_message", "Erro desconhecido")
        code = (task or {}).get("status_code")
        logger.error(f"DataForSEO erro: {msg} (code={code})")
        # 40101 = credenciais inválidas → problema de configuração nosso
        if code == 40101:
            raise DataForSEOError("Erro de configuração do serviço de busca", configuration=True)
        raise DataForSEOError("Serviço de busca temporariamente indisponível")

    result = (task.get("result") or [None])[0]
    items = (result or {}).get("items") or []

    normalized = [
        _normalize_item(it, query)
        for it in items
        if it.get("title")
    ]
    logger.info(f"DataForSEO retornou {len(items)} itens, {len(normalized)} válidos")
    return normalized
