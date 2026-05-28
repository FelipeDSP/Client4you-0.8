"""Testes do `domain_email_cache` — InMemory + Supabase wrappers.

Cache global por DOMÍNIO (não por lead). Cobre lookup miss/hit, upsert,
serialização de timestamp e robustez contra erros do cliente Supabase.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from services.email_enrichment.domain_cache import (
    CacheEntry,
    InMemoryDomainEmailCache,
    SupabaseDomainEmailCache,
    _parse_ts,
)


# ─── _parse_ts ──────────────────────────────────────────────────────────────


class TestParseTs:
    def test_datetime_passthrough(self):
        dt = datetime(2026, 5, 28, 12, 0, tzinfo=timezone.utc)
        assert _parse_ts(dt) == dt

    def test_naive_datetime_becomes_utc(self):
        dt = datetime(2026, 5, 28, 12, 0)  # naive
        result = _parse_ts(dt)
        assert result.tzinfo is not None
        assert result == dt.replace(tzinfo=timezone.utc)

    def test_iso_string_with_z(self):
        result = _parse_ts("2026-05-28T12:00:00Z")
        assert result == datetime(2026, 5, 28, 12, 0, tzinfo=timezone.utc)

    def test_iso_string_with_offset(self):
        result = _parse_ts("2026-05-28T09:00:00-03:00")
        # Mesmo instante em UTC: 12:00
        assert result.astimezone(timezone.utc) == datetime(
            2026, 5, 28, 12, 0, tzinfo=timezone.utc,
        )

    def test_invalid_string_returns_epoch(self):
        result = _parse_ts("not a timestamp")
        assert result == datetime.fromtimestamp(0, tz=timezone.utc)

    def test_none_returns_epoch(self):
        result = _parse_ts(None)
        assert result == datetime.fromtimestamp(0, tz=timezone.utc)


# ─── InMemoryDomainEmailCache ───────────────────────────────────────────────


class TestInMemoryCache:
    @pytest.mark.asyncio
    async def test_lookup_miss_returns_none(self):
        cache = InMemoryDomainEmailCache()
        assert await cache.lookup("empresa.com.br") is None

    @pytest.mark.asyncio
    async def test_upsert_then_lookup(self):
        cache = InMemoryDomainEmailCache()
        entry = CacheEntry(
            email="contato@empresa.com.br",
            source="firecrawl_search",
            confidence=0.9,
            cost_usd=0.02,
            scraped_at=datetime(2026, 5, 28, tzinfo=timezone.utc),
        )
        await cache.upsert("empresa.com.br", entry)
        retrieved = await cache.lookup("empresa.com.br")
        assert retrieved is not None
        assert retrieved.email == "contato@empresa.com.br"
        assert retrieved.source == "firecrawl_search"

    @pytest.mark.asyncio
    async def test_upsert_overwrites(self):
        cache = InMemoryDomainEmailCache()
        scraped = datetime(2026, 5, 28, tzinfo=timezone.utc)
        await cache.upsert("x.com", CacheEntry(
            email="old@x.com", source="firecrawl_search",
            confidence=0.6, cost_usd=0.01, scraped_at=scraped,
        ))
        await cache.upsert("x.com", CacheEntry(
            email="new@x.com", source="firecrawl_map_scrape",
            confidence=0.95, cost_usd=0.03, scraped_at=scraped,
        ))
        retrieved = await cache.lookup("x.com")
        assert retrieved is not None
        assert retrieved.email == "new@x.com"
        assert retrieved.confidence == 0.95

    @pytest.mark.asyncio
    async def test_negative_cache_entry(self):
        """email=None é entry válida (cache negativo). Distinto de lookup miss."""
        cache = InMemoryDomainEmailCache()
        await cache.upsert("nosignal.com", CacheEntry(
            email=None, source="firecrawl_map_scrape",
            confidence=0.0, cost_usd=0.02,
            scraped_at=datetime(2026, 5, 28, tzinfo=timezone.utc),
        ))
        retrieved = await cache.lookup("nosignal.com")
        assert retrieved is not None
        assert retrieved.email is None
        assert retrieved.cost_usd == 0.02


# ─── SupabaseDomainEmailCache ───────────────────────────────────────────────


class _FakeSupabase:
    """Mock minimalista do cliente supabase-py: chain table().select().eq()...execute()."""

    def __init__(self, select_rows: list[dict] | None = None, raise_on: str | None = None):
        self._rows = select_rows or []
        self._raise_on = raise_on  # "select" | "upsert" | None
        self.last_upsert: dict | None = None
        self.last_table: str | None = None

    def table(self, name: str):
        self.last_table = name
        return _FakeQuery(self)


class _FakeQuery:
    def __init__(self, parent: _FakeSupabase):
        self._p = parent

    def select(self, *_args, **_kw): return self
    def eq(self, *_args, **_kw): return self
    def limit(self, *_args, **_kw): return self

    def upsert(self, payload, **_kw):
        self._p.last_upsert = payload
        return self

    def execute(self):
        if self._p._raise_on == "select" and self._p.last_upsert is None:
            raise RuntimeError("simulated select failure")
        if self._p._raise_on == "upsert" and self._p.last_upsert is not None:
            raise RuntimeError("simulated upsert failure")
        return SimpleNamespace(data=self._p._rows)


class TestSupabaseCache:
    @pytest.mark.asyncio
    async def test_lookup_returns_none_when_empty(self):
        cache = SupabaseDomainEmailCache(_FakeSupabase(select_rows=[]))
        assert await cache.lookup("empresa.com.br") is None

    @pytest.mark.asyncio
    async def test_lookup_parses_row(self):
        cache = SupabaseDomainEmailCache(_FakeSupabase(select_rows=[{
            "email": "contato@empresa.com.br",
            "source": "firecrawl_search",
            "confidence": "0.85",  # supabase pode devolver string em NUMERIC
            "cost_usd": "0.02",
            "scraped_at": "2026-05-28T12:00:00Z",
        }]))
        entry = await cache.lookup("empresa.com.br")
        assert entry is not None
        assert entry.email == "contato@empresa.com.br"
        assert entry.confidence == 0.85
        assert entry.cost_usd == 0.02
        assert entry.scraped_at == datetime(2026, 5, 28, 12, 0, tzinfo=timezone.utc)

    @pytest.mark.asyncio
    async def test_lookup_swallows_exception(self):
        """Erro no Supabase → retorna None (cache não bloqueia enrichment)."""
        cache = SupabaseDomainEmailCache(_FakeSupabase(raise_on="select"))
        assert await cache.lookup("x.com") is None

    @pytest.mark.asyncio
    async def test_upsert_sends_expected_payload(self):
        fake = _FakeSupabase()
        cache = SupabaseDomainEmailCache(fake)
        await cache.upsert("empresa.com.br", CacheEntry(
            email="contato@empresa.com.br",
            source="firecrawl_search",
            confidence=0.9,
            cost_usd=0.03,
            scraped_at=datetime(2026, 5, 28, tzinfo=timezone.utc),
        ))
        assert fake.last_table == "domain_email_cache"
        assert fake.last_upsert is not None
        assert fake.last_upsert["domain"] == "empresa.com.br"
        assert fake.last_upsert["email"] == "contato@empresa.com.br"
        assert fake.last_upsert["confidence"] == 0.9
        # `updated_at` carimbado pelo cliente, formato ISO
        assert "updated_at" in fake.last_upsert

    @pytest.mark.asyncio
    async def test_upsert_swallows_exception(self):
        """Erro no Supabase no upsert → logamos e seguimos."""
        cache = SupabaseDomainEmailCache(_FakeSupabase(raise_on="upsert"))
        # Não deve levantar
        await cache.upsert("x.com", CacheEntry(
            email=None, source=None, confidence=0.0, cost_usd=0.0,
            scraped_at=datetime(2026, 5, 28, tzinfo=timezone.utc),
        ))
