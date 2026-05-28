"""Cache global de email por domínio.

Tabela `domain_email_cache` (migration v9) é GLOBAL — sem `company_id`. RLS
bloqueia tudo exceto `service_role`. Cache por domínio (não por lead) permite
que múltiplos leads do mesmo site (franquias, redes) compartilhem o scrape.

Cache negativo também é armazenado: se o scrape rodou e não achou email,
guarda `email=NULL` — evita re-scrapar o mesmo domínio sem-email todo mês.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Protocol

import logging

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    email: Optional[str]
    source: Optional[str]
    confidence: float
    cost_usd: float
    scraped_at: datetime


class DomainEmailCache(Protocol):
    async def lookup(self, domain: str) -> Optional[CacheEntry]: ...
    async def upsert(self, domain: str, entry: CacheEntry) -> None: ...


def _parse_ts(raw) -> datetime:
    """Aceita datetime, ISO string, ou None. Default = epoch (forçará re-scrape)."""
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, str) and raw:
        try:
            # Python 3.11+ aceita 'Z' suffix; pra compat, troca por +00:00
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            logger.warning(f"domain_email_cache: timestamp inválido {raw!r}, tratando como epoch")
    return datetime.fromtimestamp(0, tz=timezone.utc)


class SupabaseDomainEmailCache:
    """Impl via supabase-py. Backend usa service_role, RLS bypassa.

    A tabela tem PK em `domain`, então upsert deduplica naturalmente.
    """

    TABLE = "domain_email_cache"

    def __init__(self, supabase_client):
        self._db = supabase_client

    async def lookup(self, domain: str) -> Optional[CacheEntry]:
        try:
            resp = (
                self._db.table(self.TABLE)
                .select("email,source,confidence,cost_usd,scraped_at")
                .eq("domain", domain)
                .limit(1)
                .execute()
            )
        except Exception as e:
            logger.warning(f"domain_email_cache lookup falhou ({domain}): {type(e).__name__}: {e}")
            return None
        rows = resp.data or []
        if not rows:
            return None
        row = rows[0]
        return CacheEntry(
            email=row.get("email"),
            source=row.get("source"),
            confidence=float(row.get("confidence") or 0),
            cost_usd=float(row.get("cost_usd") or 0),
            scraped_at=_parse_ts(row.get("scraped_at")),
        )

    async def upsert(self, domain: str, entry: CacheEntry) -> None:
        now = datetime.now(timezone.utc).isoformat()
        payload = {
            "domain": domain,
            "email": entry.email,
            "source": entry.source,
            "confidence": entry.confidence,
            "cost_usd": entry.cost_usd,
            "scraped_at": entry.scraped_at.isoformat(),
            "updated_at": now,
        }
        try:
            self._db.table(self.TABLE).upsert(payload, on_conflict="domain").execute()
        except Exception as e:
            logger.warning(f"domain_email_cache upsert falhou ({domain}): {type(e).__name__}: {e}")


class InMemoryDomainEmailCache:
    """Fake pra testes. Sem TTL, sem locking."""

    def __init__(self):
        self._store: dict[str, CacheEntry] = {}

    async def lookup(self, domain: str) -> Optional[CacheEntry]:
        return self._store.get(domain)

    async def upsert(self, domain: str, entry: CacheEntry) -> None:
        self._store[domain] = entry
