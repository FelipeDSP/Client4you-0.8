"""Seletor da fonte de descoberta de leads (env `LEAD_SOURCE`).

DataForSEO (default, produção — ver ADR-002) vs Serper (dev/teste). Resolve UMA
vez no import: `LEAD_SOURCE` é config de processo, não muda em runtime. A rota
importa `search_google_maps`, `MAX_DEPTH` e `LeadSourceError` daqui — nenhuma
lógica de rota é duplicada, só a ORIGEM do search_google_maps muda.

    LEAD_SOURCE=dataforseo   (default) → dataforseo_service
    LEAD_SOURCE=serper                 → serper_service
    LEAD_SOURCE=scrappa                → scrappa_service

`LeadSourceError` é a exceção-base que a rota captura. `SerperError` herda de
`DataForSEOError`, então `except LeadSourceError` cobre as duas fontes com o
mesmo tratamento (500 se `.configuration`, senão 503).
"""
import logging
import os

from dataforseo_service import DataForSEOError

logger = logging.getLogger(__name__)

# Exceção-base comum. DataForSEOError já é a raiz (SerperError herda dela).
LeadSourceError = DataForSEOError

_SOURCE = (os.getenv("LEAD_SOURCE") or "dataforseo").strip().lower()

if _SOURCE == "serper":
    from serper_service import search_google_maps, MAX_DEPTH  # noqa: F401
    logger.info("LEAD_SOURCE=serper — descoberta via Serper.dev (dev/teste)")
elif _SOURCE == "scrappa":
    from scrappa_service import search_google_maps, MAX_DEPTH  # noqa: F401
    logger.info("LEAD_SOURCE=scrappa — descoberta via Scrappa.co (dev/teste)")
elif _SOURCE in ("", "dataforseo"):
    from dataforseo_service import search_google_maps, MAX_DEPTH  # noqa: F401
    logger.info("LEAD_SOURCE=dataforseo — descoberta via DataForSEO (produção)")
else:
    logger.warning(
        "LEAD_SOURCE=%r desconhecido — usando dataforseo (default)", _SOURCE
    )
    from dataforseo_service import search_google_maps, MAX_DEPTH  # noqa: F401

__all__ = ["search_google_maps", "MAX_DEPTH", "LeadSourceError"]
