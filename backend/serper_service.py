"""
Serper.dev — busca de leads no Google Maps (fonte ALTERNATIVA de dev/teste).

⚠️ DataForSEO continua sendo a fonte canônica de produção (ver ADR-002). Este
módulo existe pra desenvolver/testar sem depender da conta DataForSEO (travada
por verificação BR). A escolha da fonte é feita por `LEAD_SOURCE` (ver
`lead_source.py`), não aqui.

Espelha a MESMA assinatura pública do `dataforseo_service`:
    - search_google_maps(query, location, depth) -> list[dict]
    - MAX_DEPTH
    - SerperError (subclasse de DataForSEOError p/ a rota capturar sem mudança)

Credencial em variável de ambiente (infra do SaaS, não no banco):
    SERPER_API_KEY

Usa httpx em HTTP/1.1 (mesmo padrão do dataforseo_service/firecrawl_service)
pra evitar os RemoteProtocolError de connection-pool que tivemos com HTTP/2.

────────────────────────────────────────────────────────────────────────────
LIMITE DE RESULTADOS POR CHAMADA
────────────────────────────────────────────────────────────────────────────
Diferente do DataForSEO (`depth=700` numa request), o Serper /maps devolve um
número LIMITADO de `places` por query (cap documentado ~20 — ADR-002). A
cobrança é por QUERY (3 créditos), não por resultado. `MAX_DEPTH` abaixo reflete
esse teto de UMA chamada. Se um dia for preciso mais que isso, o Serper pagina
via `page=1,2,3,...` — mas é paginação cliente (N requests HTTP, dedup manual,
degrada acima de ~100 resultados).

# TODO(paginação): implementar loop de `page` se o volume por busca justificar.
#   NÃO implementado agora de propósito (ADR-002 §2). Uma chamada = uma página.
"""
import logging
import os

import httpx

from dataforseo_service import DataForSEOError

logger = logging.getLogger(__name__)

SERPER_MAPS_URL = "https://google.serper.dev/maps"

# Teto de resultados por UMA chamada ao Serper /maps (ADR-002: cap ~20/query).
# Sem paginação (ver TODO acima), este é o máximo real que uma busca devolve.
MAX_DEPTH = 20


class SerperError(DataForSEOError):
    """Erro de configuração ou da API Serper.

    Herda de DataForSEOError de propósito: a rota (`routes/leads.py`) captura a
    exceção base via `LeadSourceError`, então as duas fontes compartilham o
    mesmo tratamento (500 se `configuration=True`, senão 503). O tipo distinto
    mantém os logs legíveis.
    """


def _api_key() -> str:
    key = os.getenv("SERPER_API_KEY")
    if not key:
        logger.error("SERPER_API_KEY ausente — busca via Serper desabilitada")
        raise SerperError("Serviço de busca não configurado", configuration=True)
    return key


def _normalize_item(item: dict, fallback_category: str) -> dict:
    """Mapeia um `place` do Serper para as colunas da tabela `leads`.

    Mapeamento VERIFICADO contra chamada real (smoke test em "restaurante" /
    "Ariquemes RO", 2026-07-20): `places[].{title, phoneNumber, website,
    address, rating, ratingCount, type}`. Fixture real em
    `tests/test_serper_service.py`.

    Produz EXATAMENTE as mesmas chaves que
    `dataforseo_service._normalize_item`. Campos que o Serper Maps não fornece
    ficam coerentes: has_whatsapp=False, email=None, has_email=False,
    contact_url=None (o /maps não expõe URL de contato do GMB).
    """
    reviews = item.get("ratingCount")
    return {
        "name": item.get("title"),
        "phone": item.get("phoneNumber") or None,
        "address": item.get("address") or None,
        "website": item.get("website") or None,
        "rating": item.get("rating"),
        "reviews_count": reviews if isinstance(reviews, int) else (reviews or 0),
        "category": item.get("type") or fallback_category,
        "has_whatsapp": False,
        "email": None,
        "has_email": False,
        "contact_url": None,
    }


async def search_google_maps(query: str, location: str, depth: int) -> list[dict]:
    """
    Busca estabelecimentos no Google Maps via Serper.dev.

    Retorna lista de dicts já no formato das colunas de `leads` (sem company_id
    nem search_id — quem chama preenche), idêntico ao `dataforseo_service`.

    `depth` é capado por MAX_DEPTH (teto de uma chamada). Sem paginação: uma
    única página é retornada, independentemente de `depth > MAX_DEPTH`.

    Levanta SerperError em falha de configuração ou erro da API.
    """
    api_key = _api_key()
    depth = max(1, min(int(depth), MAX_DEPTH))

    # Paridade com DataForSEO: monta a query como "<termo> em <local>".
    keyword = f"{query.strip()} em {location.strip()}"
    payload = {
        "q": keyword,
        "gl": "br",      # país: Brasil
        "hl": "pt-br",   # idioma: português BR
        # `num` faz o depth ser respeitado: sem ele o Serper devolve ~20 fixo,
        # ignorando o depth capado pela quota. Verificado por chamada real:
        # num=20 → 20 places. Nunca passa de MAX_DEPTH (já capado acima).
        "num": depth,
    }

    logger.info(f"Serper: buscando '{keyword}' (depth cap={depth})")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                SERPER_MAPS_URL,
                headers={
                    "X-API-KEY": api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except Exception as e:
        logger.error(f"Serper fetch falhou: {type(e).__name__}: {e}")
        raise SerperError("Serviço de busca temporariamente indisponível")

    # 401/403 = chave inválida/sem crédito/acesso recusado → configuração nossa.
    if resp.status_code in (401, 403):
        logger.error(
            f"Serper recusou ({resp.status_code}). "
            f"Verifique SERPER_API_KEY e o saldo de créditos. Body: {resp.text[:300]}"
        )
        raise SerperError("Erro de configuração do serviço de busca", configuration=True)

    if resp.status_code != 200:
        logger.error(f"Serper erro HTTP {resp.status_code}: {resp.text[:300]}")
        raise SerperError("Serviço de busca temporariamente indisponível")

    try:
        data = resp.json()
    except Exception:
        logger.error(f"Serper resposta não-JSON ({resp.status_code}): {resp.text[:300]}")
        raise SerperError("Serviço de busca temporariamente indisponível")

    # Container `places` — verificado contra chamada real (smoke test).
    places = data.get("places") or []

    normalized = [
        _normalize_item(it, query)
        for it in places
        if it.get("title")
    ]
    logger.info(f"Serper retornou {len(places)} places, {len(normalized)} válidos")
    return normalized
