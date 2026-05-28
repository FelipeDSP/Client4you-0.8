"""Provider: BrasilAPI `/api/cnpj/v1/{cnpj}` — metadata da Receita Federal.

Histórico: este provider era de email enrichment até o PR 3. Validação real
com 12 empresas brasileiras mostrou que BrasilAPI retorna `email=None` em
~100% dos casos (provável LGPD). Rebaixado pra metadata enrichment no PR 4 —
agora popula telefone oficial, razão social, CNAE, porte, situação cadastral
e QSA (sócios). Decisão registrada em `docs/ADR-001-fontes-de-dados.md`.

Custo: $0 — BrasilAPI é grátis, sem auth. Rate-limited (~3 req/s sustentado).

Pré-requisito: `lead.cnpj` precisa estar setado e válido.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Optional

import httpx

from ..cnpj_utils import normalize_cnpj
from .base import MetadataEnrichmentProvider, MetadataResult

logger = logging.getLogger(__name__)

_DEFAULT_BASE = "https://brasilapi.com.br/api/cnpj/v1"

# BrasilAPI normalmente responde em < 2s. 10s cobre spike + retry implícito.
_TIMEOUT_S = 10.0


def _is_enabled() -> bool:
    return os.getenv("ENABLE_RECEITA_FEDERAL_PROVIDER", "true").lower() == "true"


def _api_base() -> str:
    """Permite override pra testes/mirror. Default: BrasilAPI oficial."""
    return os.getenv("BRASIL_API_CNPJ_BASE", _DEFAULT_BASE).rstrip("/")


def _format_phone(ddd: Optional[str], number: Optional[str]) -> Optional[str]:
    """BrasilAPI devolve DDD e número separados. Junta como `DDXXXXYYYY`.

    Retorna apenas dígitos (sem +55 e sem máscara) — caller decide formato.
    """
    ddd = re.sub(r"\D", "", ddd or "")
    number = re.sub(r"\D", "", number or "")
    if not ddd or not number:
        return None
    combined = ddd + number
    # Telefone brasileiro: 10 (fixo) ou 11 (celular) dígitos com DDD.
    if len(combined) not in (10, 11):
        return None
    return combined


def _pick_phone(data: dict) -> Optional[str]:
    """Pega o melhor telefone disponível na resposta BrasilAPI."""
    # Campos vistos em payloads reais: ddd_telefone_1/2 (já trazem DDD junto)
    # e às vezes ddd separado. Tentamos os dois formatos.
    raw1 = (data.get("ddd_telefone_1") or "").strip()
    raw2 = (data.get("ddd_telefone_2") or "").strip()
    for raw in (raw1, raw2):
        if not raw:
            continue
        digits = re.sub(r"\D", "", raw)
        if len(digits) in (10, 11):
            return digits
    # Fallback raro: campos separados
    return _format_phone(data.get("ddd"), data.get("telefone"))


class ReceitaFederalMetadataProvider(MetadataEnrichmentProvider):
    name = "receita_federal"
    cost_per_call = 0.0  # BrasilAPI é grátis

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client

    async def enrich(self, lead: dict) -> Optional[MetadataResult]:
        if not _is_enabled():
            return None

        cnpj = normalize_cnpj(lead.get("cnpj"))
        if not cnpj:
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
                return MetadataResult(source=self.name, cost_usd=0.0)

            if resp.status_code == 404:
                logger.info(f"{self.name}: CNPJ {cnpj} não encontrado na Receita")
                return MetadataResult(source=self.name, cost_usd=0.0)
            if resp.status_code == 429:
                logger.warning(f"{self.name}: rate limited por BrasilAPI")
                return MetadataResult(source=self.name, cost_usd=0.0)
            if resp.status_code >= 400:
                logger.warning(
                    f"{self.name}: HTTP {resp.status_code} body={resp.text[:200]}"
                )
                return MetadataResult(source=self.name, cost_usd=0.0)

            try:
                data = resp.json()
            except ValueError:
                logger.warning(f"{self.name}: resposta não-JSON: {resp.text[:200]}")
                return MetadataResult(source=self.name, cost_usd=0.0)

            qsa_raw = data.get("qsa")
            qsa = qsa_raw if isinstance(qsa_raw, list) else None

            return MetadataResult(
                source=self.name,
                cost_usd=0.0,
                phone=_pick_phone(data),
                razao_social=(data.get("razao_social") or "").strip() or None,
                nome_fantasia=(data.get("nome_fantasia") or "").strip() or None,
                cnae=(data.get("cnae_fiscal_descricao") or "").strip() or None,
                porte=(data.get("porte") or data.get("descricao_porte") or "").strip() or None,
                situacao_cadastral=(data.get("descricao_situacao_cadastral") or "").strip() or None,
                qsa=qsa,
                raw=data,
            )
        finally:
            if owns_client:
                await client.aclose()
