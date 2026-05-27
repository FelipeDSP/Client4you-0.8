"""Provider: lista URLs do domínio (`/v1/map`), filtra slugs prováveis de contato,
raspa as melhores 2-3 via `/v1/scrape`.

Fallback final na cascata — só roda se DataForSEOContactUrl e FirecrawlSearch
falharem. Custo maior (1 map + até 3 scrapes).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

from ..cnpj_utils import extract_cnpjs
from .base import EmailProvider, EmailResult
from .validators import extract_emails, pick_best_email

logger = logging.getLogger(__name__)

# Slugs que costumam ter email no rodapé / corpo da página.
# Match por substring case-insensitive na URL.
_CONTACT_SLUGS: tuple[str, ...] = (
    "contato", "contact", "fale-conosco", "fale_conosco",
    "sobre", "about", "quem-somos", "quem_somos",
    "equipe", "team",
    "atendimento", "suporte", "support",
    "orcamento", "orcamentos",
)

MAX_SCRAPES = 3

_TIMEOUT_S = 20.0

# Score mínimo pra parar de raspar (otimização — economiza credits Firecrawl).
_EARLY_STOP_SCORE = 0.8


def _is_enabled() -> bool:
    return os.getenv("ENABLE_FIRECRAWL_MAP_SCRAPE_PROVIDER", "true").lower() == "true"


def _firecrawl_base() -> str:
    return os.getenv("FIRECRAWL_BASE_URL", "https://api.firecrawl.dev/v1").rstrip("/")


def _rank_urls(urls: list[str]) -> list[str]:
    """Coloca URLs com slugs de contato primeiro, mantendo ordem original do resto."""
    contact: list[str] = []
    other: list[str] = []
    for u in urls:
        u_lower = u.lower()
        if any(slug in u_lower for slug in _CONTACT_SLUGS):
            contact.append(u)
        else:
            other.append(u)
    return contact + other


class FirecrawlMapScrapeProvider(EmailProvider):
    name = "firecrawl_map_scrape"
    cost_per_call = 0.015  # estimativa USD: 1 map + até MAX_SCRAPES scrapes

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client

    async def find_email(self, lead: dict) -> Optional[EmailResult]:
        if not _is_enabled():
            return None
        api_key = os.getenv("FIRECRAWL_API_KEY")
        if not api_key:
            logger.warning(f"{self.name}: FIRECRAWL_API_KEY ausente — provider desabilitado")
            return None
        website = lead.get("website")
        if not website:
            return None

        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=_TIMEOUT_S)
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        try:
            # ─── 1) /v1/map — lista URLs do domínio ──────────────────────
            try:
                map_resp = await client.post(
                    f"{_firecrawl_base()}/map",
                    headers=headers,
                    json={"url": website},
                )
            except httpx.HTTPError as e:
                logger.warning(f"{self.name}: map falhou: {type(e).__name__}: {e}")
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )
            if map_resp.status_code >= 400:
                logger.info(f"{self.name}: map HTTP {map_resp.status_code}")
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )
            map_data = map_resp.json()
            urls = map_data.get("links") or []
            if not urls:
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=self.cost_per_call,
                )

            # ─── 2) Ranqueia + corta nas top MAX_SCRAPES ─────────────────
            top_urls = _rank_urls(urls)[:MAX_SCRAPES]

            # ─── 3) Scrape sequencial com early stop ─────────────────────
            all_emails: list[str] = []
            all_cnpjs: list[str] = []  # side-channel pra orchestrator persistir
            for u in top_urls:
                try:
                    s_resp = await client.post(
                        f"{_firecrawl_base()}/scrape",
                        headers=headers,
                        json={"url": u, "formats": ["markdown"]},
                    )
                except httpx.HTTPError as e:
                    logger.warning(f"{self.name}: scrape {u} falhou: {type(e).__name__}: {e}")
                    continue
                if s_resp.status_code >= 400:
                    logger.info(f"{self.name}: scrape {u} HTTP {s_resp.status_code}")
                    continue
                data = s_resp.json()
                md = (
                    data.get("data", {}).get("markdown", "")
                    or data.get("markdown", "")
                )
                all_emails.extend(extract_emails(md))
                # CNPJs validados achados no rodapé/contato — vão pro side-channel
                for c in extract_cnpjs(md, validate=True):
                    if c not in all_cnpjs:
                        all_cnpjs.append(c)

                # Early stop: se já temos um email de alta confiança, para
                best_so_far = pick_best_email(all_emails, lead)
                if best_so_far and best_so_far[1] >= _EARLY_STOP_SCORE:
                    email, score = best_so_far
                    return EmailResult(
                        email=email, source=self.name, confidence=score,
                        cost_usd=self.cost_per_call,
                        extracted_cnpjs=all_cnpjs,
                    )

            best = pick_best_email(all_emails, lead)
            if not best:
                return EmailResult(
                    email=None, source=self.name, confidence=0.0,
                    cost_usd=self.cost_per_call,
                    extracted_cnpjs=all_cnpjs,
                )
            email, score = best
            return EmailResult(
                email=email, source=self.name, confidence=score,
                cost_usd=self.cost_per_call,
                extracted_cnpjs=all_cnpjs,
            )
        finally:
            if owns_client:
                await client.aclose()
