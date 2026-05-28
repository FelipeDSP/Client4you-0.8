"""EmailEnrichmentOrchestrator — cascata de providers + cache.

Pipeline pra UM lead:
1. Sem domínio derivável (sem website nem domain) → skip, result vazio.
2. Lookup em `domain_email_cache`. Hit fresco (< TTL) → retorna direto, $0.
3. Cascata de providers (DataForSEO contact_url → Firecrawl search → Firecrawl map+scrape):
   - early-stop se confidence >= EARLY_STOP_CONFIDENCE
   - acumula custo + CNPJs extraídos
4. UPSERT no cache (com email OU None — cache negativo).
5. Retorna `OrchestratorResult` com tudo.

Persistência em `leads`/`user_quotas` fica no caller — orchestrator é puro.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from ..email_providers.base import EmailProvider, EmailResult
from ..email_providers.dataforseo_contact_url import DataForSEOContactUrlProvider
from ..email_providers.firecrawl_map_scrape import FirecrawlMapScrapeProvider
from ..email_providers.firecrawl_search import FirecrawlSearchProvider
from ..email_providers.validators import get_domain
from .domain_cache import CacheEntry, DomainEmailCache

logger = logging.getLogger(__name__)


@dataclass
class OrchestratorResult:
    """Resultado agregado de uma tentativa de enrichment.

    `cached=True` significa que veio do `domain_email_cache` (cost_usd=0).
    `email=None` com `cached=False` significa que cascata rodou e não achou —
    o caller deve persistir last_enrichment_attempted_at mesmo assim, pra
    evitar reprocessar o lead na próxima.
    """

    lead_id: str
    email: Optional[str]
    source: Optional[str]
    confidence: float
    cost_usd: float
    cached: bool
    extracted_cnpjs: list[str] = field(default_factory=list)


class EmailEnrichmentOrchestrator:
    EARLY_STOP_CONFIDENCE = 0.8
    DEFAULT_CACHE_TTL_DAYS = 30

    def __init__(
        self,
        cache: DomainEmailCache,
        providers: Optional[list[EmailProvider]] = None,
        cache_ttl_days: int = DEFAULT_CACHE_TTL_DAYS,
    ):
        self._cache = cache
        # Default da cascata: ordem importa (mais barato e específico primeiro).
        self._providers = providers if providers is not None else [
            DataForSEOContactUrlProvider(),
            FirecrawlSearchProvider(),
            FirecrawlMapScrapeProvider(),
        ]
        self._cache_ttl = timedelta(days=cache_ttl_days)

    def _is_fresh(self, scraped_at: datetime) -> bool:
        now = datetime.now(timezone.utc)
        if scraped_at.tzinfo is None:
            scraped_at = scraped_at.replace(tzinfo=timezone.utc)
        return (now - scraped_at) < self._cache_ttl

    async def enrich(self, lead: dict, bypass_cache: bool = False) -> OrchestratorResult:
        """Pipeline pra 1 lead.

        Args:
            lead: dict com website / contact_url / cnpj / id.
            bypass_cache: se True, pula lookup E upsert do cache global.
                Usado pelo botão "Reenriquecer" (PR 6) que força always-miss
                pra cliente que quer dado fresh. Sempre gasta Firecrawl.
        """
        lead_id = str(lead.get("id") or "")
        domain = get_domain(lead.get("website")) or get_domain(lead.get("domain"))

        if not domain:
            return OrchestratorResult(
                lead_id=lead_id, email=None, source=None,
                confidence=0.0, cost_usd=0.0, cached=False,
            )

        # ── (2) Cache lookup (pulado em bypass_cache) ─────────────────────
        if not bypass_cache:
            cached = await self._cache.lookup(domain)
            if cached and self._is_fresh(cached.scraped_at):
                return OrchestratorResult(
                    lead_id=lead_id,
                    email=cached.email,
                    source=cached.source or "cache_hit",
                    confidence=cached.confidence,
                    cost_usd=0.0,
                    cached=True,
                )

        # ── (3) Cascata ───────────────────────────────────────────────────
        total_cost = 0.0
        best: Optional[EmailResult] = None
        cnpjs: list[str] = []

        for provider in self._providers:
            try:
                result = await provider.find_email(lead)
            except Exception as e:
                logger.warning(
                    f"orchestrator: provider {provider.name} raised "
                    f"{type(e).__name__}: {e}"
                )
                continue

            if result is None:
                continue  # provider não aplicável a este lead

            total_cost += result.cost_usd
            cnpjs.extend(result.extracted_cnpjs)

            if result.email:
                if best is None or result.confidence > best.confidence:
                    best = result
                if result.confidence >= self.EARLY_STOP_CONFIDENCE:
                    break

        # ── (4) Cache upsert (positivo OU negativo) ───────────────────────
        # bypass_cache também pula o upsert: reenriquecimento não polui o
        # cache global com um resultado que pode ser stale do POV de outros
        # leads do mesmo domínio. Quem reenriqueceu pegou um "snapshot" só
        # pra si — o cache mantém a entry anterior.
        final_email = best.email if best else None
        final_source = best.source if best else None
        final_conf = best.confidence if best else 0.0

        if not bypass_cache:
            await self._cache.upsert(domain, CacheEntry(
                email=final_email,
                source=final_source,
                confidence=final_conf,
                cost_usd=total_cost,
                scraped_at=datetime.now(timezone.utc),
            ))

        # Dedup CNPJs preservando ordem (mesmo CNPJ em N páginas = 1 entrada)
        seen: set[str] = set()
        unique_cnpjs: list[str] = []
        for c in cnpjs:
            if c not in seen:
                seen.add(c)
                unique_cnpjs.append(c)

        return OrchestratorResult(
            lead_id=lead_id,
            email=final_email,
            source=final_source,
            confidence=final_conf,
            cost_usd=total_cost,
            cached=False,
            extracted_cnpjs=unique_cnpjs,
        )
