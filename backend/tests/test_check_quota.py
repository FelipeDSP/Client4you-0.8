"""Testes de check_quota — auditoria pós-PR 6.

Foco no achado P0 #2: `requested` agora é comparado a `used + limit`, não
mais só `used >= limit`. Sem o cap, usuário com 499/500 podia mandar batch
de 1000 leads e burlar o limite numa única request.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from supabase_service import SupabaseService


def _mk_service_with_quota(plan_type="basico", **quota_overrides):
    """Cria um SupabaseService com `get_user_quota_with_plan` mockado.

    Default: plano básico ativo (500 leads, 500 email_enrich, 0 reenrich).
    """
    svc = SupabaseService.__new__(SupabaseService)  # bypass __init__
    full_quota = {
        "subscription_status": "active",
        "plan_type": plan_type,
        "leads_limit": 500, "leads_used": 0,
        "campaigns_limit": -1, "campaigns_used": 0,
        "messages_limit": -1, "messages_sent": 0,
        "email_enrichment_limit": 500, "emails_enriched_used": 0,
        "reenrich_limit": 0, "reenrich_used": 0,
        **quota_overrides,
    }
    svc.get_user_quota_with_plan = AsyncMock(return_value=full_quota)
    return svc


# ─── Bypass por batch único — achado P0 #2 ─────────────────────────────────


@pytest.mark.asyncio
async def test_blocks_batch_that_would_exceed_limit():
    """Cenário do bug: usuário 499/500 manda 1000 leads num só batch."""
    svc = _mk_service_with_quota(emails_enriched_used=499)
    result = await svc.check_quota("u1", "email_enrich", requested=1000)
    assert result["allowed"] is False
    assert result["used"] == 499
    assert result["requested"] == 1000
    assert result["remaining"] == 1  # 500 - 499
    assert "1000" in result["reason"]


@pytest.mark.asyncio
async def test_allows_batch_exactly_at_limit():
    """Boundary: 499/500 + 1 = exatamente no limite. Permite."""
    svc = _mk_service_with_quota(emails_enriched_used=499)
    result = await svc.check_quota("u1", "email_enrich", requested=1)
    assert result["allowed"] is True


@pytest.mark.asyncio
async def test_allows_batch_with_room():
    """Espaço de sobra: 100/500 + 50 = 150, permitido."""
    svc = _mk_service_with_quota(emails_enriched_used=100)
    result = await svc.check_quota("u1", "email_enrich", requested=50)
    assert result["allowed"] is True
    assert result["used"] == 100
    assert result["requested"] == 50


@pytest.mark.asyncio
async def test_default_requested_is_1():
    """Caller que não passa `requested` mantém semântica antiga (1 unidade)."""
    svc = _mk_service_with_quota(emails_enriched_used=499)
    result = await svc.check_quota("u1", "email_enrich")  # sem requested
    # 499 + 1 = 500 = limit → permite (boundary)
    assert result["allowed"] is True


@pytest.mark.asyncio
async def test_at_limit_with_default_requested_blocks():
    """500/500 + 1 (default) > 500 → bloqueia."""
    svc = _mk_service_with_quota(emails_enriched_used=500)
    result = await svc.check_quota("u1", "email_enrich")
    assert result["allowed"] is False
    assert result["remaining"] == 0


# ─── Robustez ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_negative_requested_is_clamped_to_1():
    """Caller bugado passando 0/negativo não pode bypassar o check."""
    svc = _mk_service_with_quota(emails_enriched_used=500)
    result = await svc.check_quota("u1", "email_enrich", requested=0)
    assert result["allowed"] is False  # 500 + 1 > 500


@pytest.mark.asyncio
async def test_unlimited_plan_allows_any_batch_size():
    """leads_limit=-1 (futuro plano ilimitado) ignora requested."""
    svc = _mk_service_with_quota(leads_limit=-1, leads_used=999_999)
    result = await svc.check_quota("u1", "lead_search", requested=10_000)
    assert result["allowed"] is True
    assert result.get("unlimited") is True


# ─── Sub-quota reenrich ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reenrich_blocks_when_plano_basico():
    """Plano básico tem reenrich_limit=0 → qualquer reenrich é bloqueado."""
    svc = _mk_service_with_quota(reenrich_limit=0)
    result = await svc.check_quota("u1", "reenrich", requested=1)
    assert result["allowed"] is False
    assert result["limit"] == 0


@pytest.mark.asyncio
async def test_reenrich_allowed_in_intermediario():
    """Plano intermediário tem reenrich_limit=10."""
    svc = _mk_service_with_quota(reenrich_limit=10, reenrich_used=3)
    result = await svc.check_quota("u1", "reenrich", requested=5)
    assert result["allowed"] is True


@pytest.mark.asyncio
async def test_reenrich_batch_oversized_blocks():
    """Mesmo plano intermediário cai se batch > restantes."""
    svc = _mk_service_with_quota(reenrich_limit=10, reenrich_used=8)
    result = await svc.check_quota("u1", "reenrich", requested=5)
    assert result["allowed"] is False
    assert result["remaining"] == 2


# ─── Subscription inativa ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_suspended_blocks_everything():
    svc = _mk_service_with_quota(
        subscription_status="suspended",
        emails_enriched_used=0,
    )
    result = await svc.check_quota("u1", "email_enrich", requested=1)
    assert result["allowed"] is False
    assert "suspended" in result["reason"]
