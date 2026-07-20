"""
Scrappa.co — busca de leads no Google Maps (fonte ALTERNATIVA de dev/teste).

⚠️ DataForSEO continua sendo a fonte canônica de produção (ver ADR-002). Este
módulo, como o serper_service, existe pra desenvolver/testar sem depender da
conta DataForSEO travada. Escolha da fonte via `LEAD_SOURCE` (ver lead_source).

Por que Scrappa além do Serper (dados da doc oficial, 2026-07-20):
    - Tier grátis RECORRENTE: 500 créditos/mês (Serper: 2500 one-time).
    - 1 crédito = 1 request (Serper: 3 créditos/query).
    - `limit` de 1..200 numa única request (Serper: ~20 sem paginar).
      → resolve volume E durabilidade do ambiente de teste.

Espelha a MESMA assinatura pública do dataforseo_service/serper_service:
    - search_google_maps(query, location, depth) -> list[dict]
    - MAX_DEPTH
    - ScrappaError (subclasse de DataForSEOError p/ a rota capturar sem mudança)

Credencial em variável de ambiente (infra do SaaS, não no banco):
    SCRAPPA_API_KEY

Endpoint: GET https://scrappa.co/api/maps/simple-search
    query (req), limit (1..200), page (0-based), hl, gl, google_domain
    Header: x-api-key

Usa httpx em HTTP/1.1 (mesmo padrão dos outros services) pra evitar os
RemoteProtocolError de connection-pool que tivemos com HTTP/2.
"""
import logging
import os

import httpx

from dataforseo_service import DataForSEOError

logger = logging.getLogger(__name__)

SCRAPPA_MAPS_URL = "https://scrappa.co/api/maps/simple-search"

# Teto de resultados por UMA request ao simple-search (doc: limit 1..200).
# Diferente do Serper, aqui o depth é honrado de verdade até 200 numa chamada.
MAX_DEPTH = 200


class ScrappaError(DataForSEOError):
    """Erro de configuração ou da API Scrappa.

    Herda de DataForSEOError de propósito: a rota captura a base via
    `LeadSourceError`, então as três fontes compartilham o mesmo tratamento
    (500 se `configuration=True`, senão 503). O tipo distinto mantém logs legíveis.
    """


def _api_key() -> str:
    key = os.getenv("SCRAPPA_API_KEY")
    if not key:
        logger.error("SCRAPPA_API_KEY ausente — busca via Scrappa desabilitada")
        raise ScrappaError("Serviço de busca não configurado", configuration=True)
    return key


def _normalize_item(item: dict, fallback_category: str) -> dict:
    """Mapeia um `item` do Scrappa para as colunas da tabela `leads`.

    Mapeamento VERIFICADO contra chamada real (smoke test em "restaurante" /
    "Ariquemes RO", 2026-07-20). Fixture real em `tests/test_scrappa_service.py`.
    Nuances confirmadas pela chamada:
      - `phone_numbers` é um ARRAY (pegamos o primeiro). Vem sem +55, ex:
        "(69) 3536-8126".
      - `type` é o termo de busca genérico ("restaurantes"), IGUAL pra todos os
        resultados. A categoria específica do negócio está em `subtypes[0]`
        ("Restaurante", "Churrascaria", ...) — é o que usamos, pra casar com a
        semântica do DataForSEO/Serper. Fallback: type → fallback_category.

    Produz EXATAMENTE as mesmas chaves que
    `dataforseo_service._normalize_item`. Campos que o Scrappa Maps não fornece
    ficam coerentes: has_whatsapp=False, email=None, has_email=False,
    contact_url=None.
    """
    phones = item.get("phone_numbers") or []
    phone = phones[0] if isinstance(phones, list) and phones else (phones or None)
    subtypes = item.get("subtypes") or []
    category = (subtypes[0] if isinstance(subtypes, list) and subtypes else None) \
        or item.get("type") or fallback_category
    return {
        "name": item.get("name"),
        "phone": phone or None,
        "address": item.get("full_address") or None,
        "website": item.get("website") or None,
        "rating": item.get("rating"),
        "reviews_count": item.get("review_count") or 0,
        "category": category,
        "has_whatsapp": False,
        "email": None,
        "has_email": False,
        "contact_url": None,
    }


async def search_google_maps(query: str, location: str, depth: int) -> list[dict]:
    """
    Busca estabelecimentos no Google Maps via Scrappa.

    Retorna lista de dicts já no formato das colunas de `leads` (sem company_id
    nem search_id — quem chama preenche), idêntico às outras fontes.

    `depth` é capado por MAX_DEPTH e mapeado pro parâmetro `limit`.

    Levanta ScrappaError em falha de configuração ou erro da API.
    """
    api_key = _api_key()
    depth = max(1, min(int(depth), MAX_DEPTH))

    # Paridade com as outras fontes: monta a query como "<termo> em <local>".
    keyword = f"{query.strip()} em {location.strip()}"
    params = {
        "query": keyword,
        "limit": depth,   # honra o depth (até 200 numa request)
        "gl": "br",       # país: Brasil
        "hl": "pt-br",    # idioma: português BR
    }

    logger.info(f"Scrappa: buscando '{keyword}' (limit={depth})")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(
                SCRAPPA_MAPS_URL,
                headers={"x-api-key": api_key},
                params=params,
            )
    except Exception as e:
        logger.error(f"Scrappa fetch falhou: {type(e).__name__}: {e}")
        raise ScrappaError("Serviço de busca temporariamente indisponível")

    # 401/403 = chave inválida/sem crédito/acesso recusado → configuração nossa.
    if resp.status_code in (401, 403):
        logger.error(
            f"Scrappa recusou ({resp.status_code}). "
            f"Verifique SCRAPPA_API_KEY e o saldo de créditos. Body: {resp.text[:300]}"
        )
        raise ScrappaError("Erro de configuração do serviço de busca", configuration=True)

    if resp.status_code != 200:
        logger.error(f"Scrappa erro HTTP {resp.status_code}: {resp.text[:300]}")
        raise ScrappaError("Serviço de busca temporariamente indisponível")

    try:
        data = resp.json()
    except Exception:
        logger.error(f"Scrappa resposta não-JSON ({resp.status_code}): {resp.text[:300]}")
        raise ScrappaError("Serviço de busca temporariamente indisponível")

    # Container `items` — verificado contra chamada real (smoke test).
    items = data.get("items") or []

    normalized = [
        _normalize_item(it, query)
        for it in items
        if it.get("name")
    ]
    logger.info(f"Scrappa retornou {len(items)} items, {len(normalized)} válidos")
    return normalized
