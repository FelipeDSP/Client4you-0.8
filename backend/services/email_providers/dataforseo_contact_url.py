"""Provider: usa `contact_url` do payload DataForSEO como seed scrape.

DataForSEO retorna `contact_url` em cada item do Google Maps — URL da página
de contato que o estabelecimento cadastrou no GMB. Bater direto nessa URL é
muito mais preciso do que chutar `/contato`, `/sobre`, `/about` etc.

Custo: $0 — fazemos `httpx.get` puro (sem API paga). Sites JS-rendered podem
não ter email no HTML cru; nesse caso o orchestrator (PR 4) cai pros providers
Firecrawl seguintes na cascata.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

from .base import EmailProvider, EmailResult
from .validators import extract_emails, pick_best_email

logger = logging.getLogger(__name__)

# User-Agent de browser real — reduz bloqueio por bot detection.
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
}

# Timeout curto: site público responde rápido ou falha. Sem timeout, um site
# lento trava a cascata inteira de enrichment.
_TIMEOUT_S = 10.0


def _is_enabled() -> bool:
    return os.getenv("ENABLE_DATAFORSEO_CONTACT_URL_PROVIDER", "true").lower() == "true"


class DataForSEOContactUrlProvider(EmailProvider):
    name = "dataforseo_contact_url"
    cost_per_call = 0.0  # GET de site público — sem cobrança externa

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        # `client` é só pra testes (MockTransport). Em produção, criamos um
        # cliente novo por chamada — uso é esporádico, não vale singleton.
        self._client = client

    async def find_email(self, lead: dict) -> Optional[EmailResult]:
        if not _is_enabled():
            return None
        contact_url = (lead.get("contact_url") or "").strip()
        if not contact_url:
            return None  # provider não aplicável (lead sem contact_url)

        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(
            timeout=_TIMEOUT_S,
            follow_redirects=True,
            headers=_BROWSER_HEADERS,
        )
        try:
            try:
                resp = await client.get(contact_url)
            except httpx.HTTPError as e:
                logger.warning(
                    f"{self.name}: GET {contact_url} falhou: {type(e).__name__}: {e}"
                )
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )

            if resp.status_code >= 400:
                logger.info(
                    f"{self.name}: GET {contact_url} HTTP {resp.status_code}"
                )
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )

            candidates = extract_emails(resp.text)
            best = pick_best_email(candidates, lead)
            if not best:
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )
            email, score = best
            return EmailResult(
                email=email, source=self.name, confidence=score, cost_usd=0.0,
            )
        finally:
            if owns_client:
                await client.aclose()
