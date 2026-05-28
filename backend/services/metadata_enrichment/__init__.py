"""Metadata enrichment providers (não-email).

Distinto de `email_providers/`: estes providers enriquecem qualificação do
lead (telefone oficial, razão social, CNAE, sócios) via fontes oficiais.
NÃO procuram email — email é responsabilidade exclusiva do
`email_providers/` cascade.

Decisão de design registrada em `docs/ADR-001-fontes-de-dados.md`: BrasilAPI
retorna `email=None` em ~100% dos casos (provável LGPD), então deixou de
fazer sentido manter Receita na cascata de email.
"""
from .base import MetadataEnrichmentProvider, MetadataResult
from .receita_federal import ReceitaFederalMetadataProvider

__all__ = [
    "MetadataEnrichmentProvider",
    "MetadataResult",
    "ReceitaFederalMetadataProvider",
]
