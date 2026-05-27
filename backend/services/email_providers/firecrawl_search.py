"""Provider: Firecrawl `/v1/search` — emails de páginas indexadas pelo Google.

Em vez de chutar URLs (/contato, /sobre, ...), manda uma query Google-style:

    site:dominio.com.br ("@dominio.com.br" OR contato OR email)

O Firecrawl resolve a busca no Google, raspa as top N páginas e devolve
markdown. 1 chamada vs 4-5 do approach antigo.

Custo: ~1 credit por chamada (~$0.005 USD em plano padrão Firecrawl).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

from ..cnpj_utils import extract_cnpjs
from .base import EmailProvider, EmailResult
from .validators import extract_emails, get_domain, pick_best_email

logger = logging.getLogger(__name__)

# Firecrawl é mais lento que GET direto (resolve o search no Google + scrape).
# 20s cobre a janela típica P95.
_TIMEOUT_S = 20.0

_DEFAULT_LIMIT = 5  # qtos resultados Google trazer; mais não compensa o custo


def _is_enabled() -> bool:
    return os.getenv("ENABLE_FIRECRAWL_SEARCH_PROVIDER", "true").lower() == "true"


def _firecrawl_base() -> str:
    return os.getenv("FIRECRAWL_BASE_URL", "https://api.firecrawl.dev/v1").rstrip("/")


def _build_query(domain: str) -> str:
    """Query Google: prioriza páginas com email do domínio, fallback pra contato."""
    return f'site:{domain} ("@{domain}" OR contato OR email)'


class FirecrawlSearchProvider(EmailProvider):
    name = "firecrawl_search"
    cost_per_call = 0.005  # estimativa USD; varia por plano Firecrawl

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client

    async def find_email(self, lead: dict) -> Optional[EmailResult]:
        if not _is_enabled():
            return None
        api_key = os.getenv("FIRECRAWL_API_KEY")
        if not api_key:
            logger.warning(f"{self.name}: FIRECRAWL_API_KEY ausente — provider desabilitado")
            return None

        domain = get_domain(lead.get("website") or lead.get("domain"))
        if not domain:
            return None  # sem site, nada pra buscar

        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=_TIMEOUT_S)
        try:
            try:
                resp = await client.post(
                    f"{_firecrawl_base()}/search",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "query": _build_query(domain),
                        "limit": _DEFAULT_LIMIT,
                        "scrapeOptions": {"formats": ["markdown"]},
                    },
                )
            except httpx.HTTPError as e:
                logger.warning(
                    f"{self.name}: search request falhou: {type(e).__name__}: {e}"
                )
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )

            if resp.status_code >= 400:
                logger.warning(
                    f"{self.name}: HTTP {resp.status_code} body={resp.text[:300]}"
                )
                # 4xx/5xx geralmente NÃO consome credit no Firecrawl
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )

            data = resp.json()
            # Shape do Firecrawl /v1/search: {success, data: [{url, markdown, ...}, ...]}
            results = data.get("data") or data.get("web") or []
            all_candidates: list[str] = []
            all_cnpjs: list[str] = []
            for item in results:
                md = item.get("markdown") or item.get("content") or ""
                all_candidates.extend(extract_emails(md))
                for c in extract_cnpjs(md, validate=True):
                    if c not in all_cnpjs:
                        all_cnpjs.append(c)

            best = pick_best_email(all_candidates, lead)
            cost = self.cost_per_call  # request foi feita com sucesso
            if not best:
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=cost,
                    extracted_cnpjs=all_cnpjs,
                )
            email, score = best
            return EmailResult(
                email=email, source=self.name, confidence=score, cost_usd=cost,
                extracted_cnpjs=all_cnpjs,
            )
        finally:
            if owns_client:
                await client.aclose()
