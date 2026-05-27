"""Testes do ReceitaFederalProvider — mocka BrasilAPI /api/cnpj/v1/{cnpj}.

CNPJ válido usado em todos os testes: 11.222.333/0001-81 (11222333000181).
"""
import httpx
import pytest

from services.email_providers.receita_federal import ReceitaFederalProvider


_VALID_CNPJ = "11222333000181"


def _make_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=5.0)


# ─── Aplicabilidade ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_none_without_cnpj():
    p = ReceitaFederalProvider()
    assert await p.find_email({"website": "https://x.com"}) is None


@pytest.mark.asyncio
async def test_returns_none_with_invalid_cnpj():
    """CNPJ com DV errado → normalize falha → provider não aplicável."""
    p = ReceitaFederalProvider()
    assert await p.find_email({"cnpj": "12345678901234"}) is None


@pytest.mark.asyncio
async def test_disabled_via_env(monkeypatch):
    monkeypatch.setenv("ENABLE_RECEITA_FEDERAL_PROVIDER", "false")
    p = ReceitaFederalProvider()
    assert await p.find_email({"cnpj": _VALID_CNPJ}) is None


# ─── Happy path ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_finds_email_with_domain_match():
    """Receita retorna email do mesmo domínio → score alto."""
    def handler(req: httpx.Request) -> httpx.Response:
        assert _VALID_CNPJ in str(req.url)
        return httpx.Response(
            200,
            json={
                "cnpj": _VALID_CNPJ,
                "razao_social": "EMPRESA TESTE LTDA",
                "email": "contato@empresa.com.br",
                "ddd_telefone_1": "11999999999",
            },
        )

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({
        "cnpj": _VALID_CNPJ,
        "website": "https://empresa.com.br",
    })
    assert result is not None
    assert result.email == "contato@empresa.com.br"
    assert result.source == "receita_federal"
    assert result.confidence >= 0.6
    assert result.cost_usd == 0.0


@pytest.mark.asyncio
async def test_accepts_masked_cnpj_in_lead():
    """Lead com CNPJ formatado (12.345.678/0001-90) — provider deve normalizar."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"email": "info@x.com.br"},
        )

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({
        "cnpj": "11.222.333/0001-81",
        "website": "https://x.com.br",
    })
    assert result is not None
    assert result.email == "info@x.com.br"


@pytest.mark.asyncio
async def test_official_source_floor_applied_when_no_domain_match():
    """Email sem match de domínio do site — confiança vai pro floor 0.6."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"email": "contato@gmail.com"},  # genérico, sem match
        )

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({
        "cnpj": _VALID_CNPJ,
        "website": "https://empresa.com.br",
    })
    assert result is not None
    # Score base: 0.5 + 0 (sem match) + 0 (não-br) + 0.1 (contato) = 0.6
    # Floor: max(0.6, 0.6) = 0.6
    assert result.email == "contato@gmail.com"
    assert result.confidence >= 0.6


# ─── Empty / sem email ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_no_email_in_payload():
    """Receita retorna sucesso mas sem campo email → email=None."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"cnpj": _VALID_CNPJ, "razao_social": "X LTDA", "email": ""},
        )

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({"cnpj": _VALID_CNPJ, "website": "https://x.com"})
    assert result is not None
    assert result.email is None
    assert result.source == "receita_federal"


@pytest.mark.asyncio
async def test_email_field_absent():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"cnpj": _VALID_CNPJ})

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({"cnpj": _VALID_CNPJ, "website": "https://x.com"})
    assert result is not None
    assert result.email is None


@pytest.mark.asyncio
async def test_blacklisted_email_filtered():
    """Receita retorna email noreply → scorer zera → email=None."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"email": "noreply@empresa.com.br"})

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({"cnpj": _VALID_CNPJ, "website": "https://empresa.com.br"})
    assert result is not None
    assert result.email is None


# ─── Erros HTTP ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_404_cnpj_not_found():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "CNPJ não encontrado"})

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({"cnpj": _VALID_CNPJ, "website": "https://x.com"})
    assert result is not None
    assert result.email is None


@pytest.mark.asyncio
async def test_429_rate_limited():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"message": "rate limited"})

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({"cnpj": _VALID_CNPJ, "website": "https://x.com"})
    assert result is not None
    assert result.email is None


@pytest.mark.asyncio
async def test_5xx_error():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream timeout")

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({"cnpj": _VALID_CNPJ, "website": "https://x.com"})
    assert result is not None
    assert result.email is None


@pytest.mark.asyncio
async def test_network_error():
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("simulated")

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({"cnpj": _VALID_CNPJ, "website": "https://x.com"})
    assert result is not None
    assert result.email is None
    assert result.source == "receita_federal"


@pytest.mark.asyncio
async def test_invalid_json_response():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not json")

    p = ReceitaFederalProvider(client=_make_client(handler))
    result = await p.find_email({"cnpj": _VALID_CNPJ, "website": "https://x.com"})
    assert result is not None
    assert result.email is None
