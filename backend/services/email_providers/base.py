"""Interface comum dos providers de enrichment de email."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class EmailResult:
    """Resultado de uma tentativa de enrichment.

    `email = None` significa "tentei e não achei" — distinto do provider devolver
    None (que significa "este provider não é aplicável a este lead").
    """

    email: Optional[str]
    source: str            # "dataforseo_contact_url" | "receita_federal" | "firecrawl_search" | "firecrawl_map_scrape"
    confidence: float      # 0.0 a 1.0 — score do validator
    cost_usd: float = 0.0  # custo estimado desta chamada (pra logging/orçamento)
    raw: Optional[dict] = field(default=None, repr=False)


class EmailProvider(ABC):
    """Interface comum dos providers. Cada um é independente e ativável por env var."""

    name: str
    cost_per_call: float  # USD estimado por chamada bem-sucedida

    @abstractmethod
    async def find_email(self, lead: dict) -> Optional[EmailResult]:
        """Procura email pra um lead.

        Returns:
            EmailResult: o provider rodou. `email` pode ser None se rodou mas
                não achou (ex: site sem email no HTML).
            None: o provider não é aplicável a este lead (ex: sem CNPJ pro
                ReceitaFederalProvider, sem website pro Firecrawl).

        Exceções de rede/HTTP devem propagar — o Orchestrator (PR 4) decide se
        loga e continua pra próximo provider.
        """
        ...
