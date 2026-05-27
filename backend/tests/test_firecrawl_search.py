"""Testes do FirecrawlSearchProvider — mocka Firecrawl `/v1/search`."""
import json

import httpx
import pytest

from services.email_providers.firecrawl_search import (
    FirecrawlSearchProvider,
    _build_query,
)


def _make_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=5.0)


@pytest.fixture(autouse=True)
def _set_api_key(monkeypatch):
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test-key")


# ─── Query builder ──────────────────────────────────────────────────────────


class TestQueryBuilder:
    def test_query_uses_domain(self):
        q = _build_query("empresa.com.br")
        assert "site:empresa.com.br" in q
        assert '"@empresa.com.br"' in q
        assert "contato" in q


# ─── find_email ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_none_without_website():
    """Sem website nem domain → provider não aplicável."""
    p = FirecrawlSearchProvider()
    assert await p.find_email({}) is None


@pytest.mark.asyncio
async def test_returns_none_when_api_key_missing(monkeypatch):
    """Sem API key → não roda."""
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    p = FirecrawlSearchProvider()
    assert await p.find_email({"website": "https://empresa.com.br"}) is None


@pytest.mark.asyncio
async def test_finds_email_in_search_results():
    """Resposta com markdown contendo email → extrai."""
    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content.decode())
        assert "site:empresa.com.br" in body["query"]
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": [
                    {
                        "url": "https://empresa.com.br/contato",
                        "markdown": "Fale conosco: contato@empresa.com.br",
                    },
                    {
                        "url": "https://empresa.com.br/sobre",
                        "markdown": "Sobre nós...",
                    },
                ],
            },
        )

    p = FirecrawlSearchProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email == "contato@empresa.com.br"
    assert result.source == "firecrawl_search"
    assert result.cost_usd == p.cost_per_call


@pytest.mark.asyncio
async def test_picks_best_when_multiple_pages_have_emails():
    """Vários markdowns, vários emails → escolhe o de maior score."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": [
                    {"url": "u1", "markdown": "random@gmail.com"},
                    {"url": "u2", "markdown": "joao.silva@empresa.com.br"},
                    {"url": "u3", "markdown": "vendas@empresa.com.br"},
                ],
            },
        )

    p = FirecrawlSearchProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email == "vendas@empresa.com.br"


@pytest.mark.asyncio
async def test_empty_results():
    """Firecrawl retorna data=[] → email=None, mas cost contabilizado."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"success": True, "data": []})

    p = FirecrawlSearchProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email is None
    assert result.cost_usd == p.cost_per_call


@pytest.mark.asyncio
async def test_http_429_returns_no_cost():
    """Rate limit do Firecrawl → não contabiliza custo (não consumiu credit)."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": "rate limited"})

    p = FirecrawlSearchProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email is None
    assert result.cost_usd == 0.0


@pytest.mark.asyncio
async def test_network_error():
    """ConnectError → email=None, cost=0."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("simulated")

    p = FirecrawlSearchProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email is None
    assert result.cost_usd == 0.0


@pytest.mark.asyncio
async def test_disabled_via_env(monkeypatch):
    monkeypatch.setenv("ENABLE_FIRECRAWL_SEARCH_PROVIDER", "false")
    p = FirecrawlSearchProvider()
    assert await p.find_email({"website": "https://x.com"}) is None


@pytest.mark.asyncio
async def test_accepts_domain_field_as_fallback():
    """DataForSEO devolve `domain` em vez de `website` — provider deve aceitar."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": [{"url": "u1", "markdown": "info@empresa.com.br"}],
            },
        )

    p = FirecrawlSearchProvider(client=_make_client(handler))
    result = await p.find_email({"domain": "empresa.com.br"})
    assert result is not None
    assert result.email == "info@empresa.com.br"


# ─── PR 3: extracted_cnpjs ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_extracts_cnpjs_from_search_results():
    """CNPJ no markdown dos resultados → vai pro extracted_cnpjs."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": [
                    {
                        "url": "https://empresa.com.br/contato",
                        "markdown": "contato@empresa.com.br CNPJ 11.222.333/0001-81",
                    },
                    {
                        "url": "https://empresa.com.br/sobre",
                        "markdown": "Filial: 33.000.167/0001-01",
                    },
                ],
            },
        )

    p = FirecrawlSearchProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email == "contato@empresa.com.br"
    assert "11222333000181" in result.extracted_cnpjs
    assert "33000167000101" in result.extracted_cnpjs
