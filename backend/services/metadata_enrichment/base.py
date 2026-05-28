"""Interface comum dos metadata enrichment providers.

Distinto do `email_providers/`:
- email providers retornam `EmailResult` (foco em email + side-channel CNPJ)
- metadata providers retornam `MetadataResult` (telefone, razão social, QSA, ...)

Os dois pipelines rodam independentes. O orchestrator de email NÃO chama
estes providers; o pipeline de metadata roda em separado (worker assíncrono,
fora do escopo do PR 4).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MetadataResult:
    """Resultado de uma tentativa de metadata enrichment.

    Todos os campos são opcionais — provider preenche os que conseguiu.
    Se NENHUM campo veio populado (todos None), o caller pode tratar como
    "fonte não tinha dado", mas o MetadataResult ainda deve ser retornado
    (distinto do provider devolver None, que significa "não aplicável").
    """

    source: str                                       # qual provider rodou
    cost_usd: float = 0.0                             # custo estimado da chamada
    phone: Optional[str] = None                       # telefone formatado/normalizado
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    cnae: Optional[str] = None                        # descrição do CNAE fiscal
    porte: Optional[str] = None                       # micro, pequeno, médio, grande
    situacao_cadastral: Optional[str] = None          # ATIVA, BAIXADA, SUSPENSA, ...
    qsa: Optional[list[dict]] = None                  # quadro social administrativo
    raw: Optional[dict] = field(default=None, repr=False)


class MetadataEnrichmentProvider(ABC):
    """Interface comum dos providers de metadata. Ativável por env var."""

    name: str
    cost_per_call: float

    @abstractmethod
    async def enrich(self, lead: dict) -> Optional[MetadataResult]:
        """Tenta enriquecer metadata do lead.

        Returns:
            MetadataResult: o provider rodou. Campos podem estar todos None
                se a fonte respondeu mas não tinha dado relevante.
            None: o provider não é aplicável a este lead (ex: sem CNPJ pro
                ReceitaFederalMetadataProvider).
        """
        ...
