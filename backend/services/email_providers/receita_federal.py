"""Provider: BrasilAPI `/api/cnpj/v1/{cnpj}` — email oficial da Receita Federal.

Cobertura altíssima para negócios formais brasileiros. Empresa com CNPJ ativo
quase sempre tem email cadastrado na Receita.

Custo: $0 — BrasilAPI é grátis, sem auth. Rate-limited (~3 req/s sustentado).

Pré-requisito: `lead.cnpj` precisa estar setado (e válido). CNPJ é populado:
- passivamente pelo scrape (FirecrawlMapScrape / DataForSEOContactUrl extraem
  via regex, orchestrator PR 4 persiste)
- manualmente via `POST /api/leads/{lead_id}/cnpj`
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

from ..cnpj_utils import normalize_cnpj
from .base import EmailProvider, EmailResult
from .validators import get_domain, score_email

logger = logging.getLogger(__name__)

_DEFAULT_BASE = "https://brasilapi.com.br/api/cnpj/v1"

# BrasilAPI normalmente responde em < 2s. 10s cobre spike + retry implícito.
_TIMEOUT_S = 10.0

# Floor de confiança quando o email vem da Receita (fonte oficial, não scrape).
# Aplicado APENAS se o score base for > 0 (blacklist continua zerando).
_OFFICIAL_SOURCE_FLOOR = 0.6


def _is_enabled() -> bool:
    return os.getenv("ENABLE_RECEITA_FEDERAL_PROVIDER", "true").lower() == "true"


def _api_base() -> str:
    """Permite override pra testes/mirror. Default: BrasilAPI oficial."""
    return os.getenv("BRASIL_API_CNPJ_BASE", _DEFAULT_BASE).rstrip("/")


class ReceitaFederalProvider(EmailProvider):
    name = "receita_federal"
    cost_per_call = 0.0  # BrasilAPI é grátis

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client

    async def find_email(self, lead: dict) -> Optional[EmailResult]:
        if not _is_enabled():
            return None

        cnpj = normalize_cnpj(lead.get("cnpj"))
        if not cnpj:
            # Provider não aplicável — sem CNPJ válido, nada a consultar.
            return None

        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=_TIMEOUT_S)
        try:
            try:
                resp = await client.get(f"{_api_base()}/{cnpj}")
            except httpx.HTTPError as e:
                logger.warning(
                    f"{self.name}: GET cnpj={cnpj} falhou: {type(e).__name__}: {e}"
                )
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )

            if resp.status_code == 404:
                logger.info(f"{self.name}: CNPJ {cnpj} não encontrado na Receita")
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )
            if resp.status_code == 429:
                logger.warning(f"{self.name}: rate limited por BrasilAPI")
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )
            if resp.status_code >= 400:
                logger.warning(
                    f"{self.name}: HTTP {resp.status_code} body={resp.text[:200]}"
                )
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )

            try:
                data = resp.json()
            except ValueError:
                logger.warning(f"{self.name}: resposta não-JSON: {resp.text[:200]}")
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )

            email = (data.get("email") or "").strip().lower()
            if not email:
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )

            # Receita pode retornar emails de hosting/blacklist em raros casos.
            # Roda o scorer; se zerou (blacklist), não usa.
            domain = get_domain(lead.get("website") or lead.get("domain"))
            score = score_email(email, domain)
            if score == 0.0:
                logger.info(
                    f"{self.name}: email da Receita rejeitado pelo scorer: {email}"
                )
                return EmailResult(
                    email=None, source=self.name, confidence=0.0, cost_usd=0.0,
                )

            # Fonte oficial — confiança mínima _OFFICIAL_SOURCE_FLOOR mesmo se o
            # scorer der baixo (ex: email sem match de domínio do site).
            confidence = max(score, _OFFICIAL_SOURCE_FLOOR)
            return EmailResult(
                email=email,
                source=self.name,
                confidence=confidence,
                cost_usd=0.0,
            )
        finally:
            if owns_client:
                await client.aclose()
