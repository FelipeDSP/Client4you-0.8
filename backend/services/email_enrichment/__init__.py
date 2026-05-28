"""Email enrichment orchestration layer (PR 4).

- `EmailEnrichmentOrchestrator`: cascata de providers + cache hit/miss.
- `DomainEmailCache` (Protocol) / `SupabaseDomainEmailCache` (impl Supabase)
  / `InMemoryDomainEmailCache` (impl pra testes).
- `OrchestratorResult`: shape da resposta agregada por lead.

Persistência em `leads` e `user_quotas` NÃO mora aqui — fica no caller
(endpoint route). Orchestrator é puro: recebe `lead: dict`, retorna result.
"""
from .domain_cache import (
    CacheEntry,
    DomainEmailCache,
    InMemoryDomainEmailCache,
    SupabaseDomainEmailCache,
)
from .orchestrator import EmailEnrichmentOrchestrator, OrchestratorResult

__all__ = [
    "EmailEnrichmentOrchestrator",
    "OrchestratorResult",
    "CacheEntry",
    "DomainEmailCache",
    "SupabaseDomainEmailCache",
    "InMemoryDomainEmailCache",
]
