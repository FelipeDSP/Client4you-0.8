"""Email enrichment providers.

Cada provider implementa `EmailProvider` e é orquestrado em cascata pelo
`EmailEnrichmentOrchestrator`. Ativação por env var.

NOTA: o `ReceitaFederalProvider` foi removido da cascata de email no PR 4b.
Validação real mostrou que BrasilAPI retorna `email=None` em ~100% dos casos.
Receita virou metadata enrichment — ver `services/metadata_enrichment/`.
"""
from ..cnpj_utils import extract_cnpjs
from .base import EmailProvider, EmailResult
from .dataforseo_contact_url import DataForSEOContactUrlProvider
from .firecrawl_map_scrape import FirecrawlMapScrapeProvider
from .firecrawl_search import FirecrawlSearchProvider
from .validators import (
    BLACKLIST_DOMAINS,
    BLACKLIST_LOCAL_PARTS,
    CORPORATE_LOCAL_PARTS,
    extract_emails,
    get_domain,
    is_valid_email,
    pick_best_email,
    score_email,
)

__all__ = [
    "EmailProvider",
    "EmailResult",
    "DataForSEOContactUrlProvider",
    "FirecrawlSearchProvider",
    "FirecrawlMapScrapeProvider",
    "BLACKLIST_DOMAINS",
    "BLACKLIST_LOCAL_PARTS",
    "CORPORATE_LOCAL_PARTS",
    "extract_cnpjs",
    "extract_emails",
    "get_domain",
    "is_valid_email",
    "pick_best_email",
    "score_email",
]
