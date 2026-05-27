"""Testes do FirecrawlMapScrapeProvider.

Mocka `/v1/map` (lista URLs) e `/v1/scrape` (retorna markdown). Testa também
o ranking de slugs e early-stop por score alto.
"""
import httpx
import pytest

from services.email_providers.firecrawl_map_scrape import (
    FirecrawlMapScrapeProvider,
    MAX_SCRAPES,
    _rank_urls,
)


def _make_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=5.0)


@pytest.fixture(autouse=True)
def _set_api_key(monkeypatch):
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test-key")


# ─── _rank_urls ─────────────────────────────────────────────────────────────


class TestRankUrls:
    def test_contact_slugs_first(self):
        urls = [
            "https://x.com/produtos",
            "https://x.com/contato",
            "https://x.com/blog",
            "https://x.com/sobre",
        ]
        ranked = _rank_urls(urls)
        # /contato e /sobre devem aparecer ANTES de /produtos e /blog
        assert ranked.index("https://x.com/contato") < ranked.index("https://x.com/produtos")
        assert ranked.index("https://x.com/sobre") < ranked.index("https://x.com/blog")

    def test_no_contact_slugs_keeps_order(self):
        urls = ["https://x.com/a", "https://x.com/b", "https://x.com/c"]
        assert _rank_urls(urls) == urls

    def test_empty(self):
        assert _rank_urls([]) == []


# ─── find_email ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_none_without_website():
    p = FirecrawlMapScrapeProvider()
    assert await p.find_email({}) is None


@pytest.mark.asyncio
async def test_returns_none_when_api_key_missing(monkeypatch):
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    p = FirecrawlMapScrapeProvider()
    assert await p.find_email({"website": "https://x.com"}) is None


@pytest.mark.asyncio
async def test_full_flow_finds_email_in_contato_page():
    """Map → /contato no top → scrape acha email → retorna."""
    scrape_calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/map" in url:
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "links": [
                        "https://empresa.com.br/produtos",
                        "https://empresa.com.br/contato",
                        "https://empresa.com.br/blog",
                    ],
                },
            )
        if "/scrape" in url:
            import json as _json
            body = _json.loads(req.content.decode())
            scrape_calls.append(body["url"])
            md = "Fale: contato@empresa.com.br" if "contato" in body["url"] else "Conteúdo"
            return httpx.Response(200, json={"success": True, "data": {"markdown": md}})
        return httpx.Response(404)

    p = FirecrawlMapScrapeProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email == "contato@empresa.com.br"
    assert result.cost_usd == p.cost_per_call
    # /contato deve ter sido a PRIMEIRA URL raspada (ranking funcionou)
    assert scrape_calls[0] == "https://empresa.com.br/contato"


@pytest.mark.asyncio
async def test_early_stop_when_high_confidence_found():
    """Achou email com score >= 0.8 na 1ª scrape → não chama as outras."""
    scrape_calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/map" in url:
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "links": [
                        "https://empresa.com.br/contato",
                        "https://empresa.com.br/sobre",
                        "https://empresa.com.br/equipe",
                    ],
                },
            )
        if "/scrape" in url:
            import json as _json
            body = _json.loads(req.content.decode())
            scrape_calls.append(body["url"])
            # Toda página retorna email do domínio (score alto)
            return httpx.Response(
                200,
                json={"success": True, "data": {"markdown": "vendas@empresa.com.br"}},
            )
        return httpx.Response(404)

    p = FirecrawlMapScrapeProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email == "vendas@empresa.com.br"
    # Early stop: parou na 1ª, não chamou as outras 2
    assert len(scrape_calls) == 1


@pytest.mark.asyncio
async def test_caps_at_max_scrapes():
    """Mesmo com 10 URLs no map, só rasp até MAX_SCRAPES."""
    scrape_calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/map" in url:
            return httpx.Response(
                200,
                json={
                    "success": True,
                    # 10 URLs sem nenhum slug de contato — early stop não ativa
                    "links": [f"https://empresa.com.br/page{i}" for i in range(10)],
                },
            )
        if "/scrape" in url:
            import json as _json
            body = _json.loads(req.content.decode())
            scrape_calls.append(body["url"])
            # Sem email em nenhuma página → segue até o cap
            return httpx.Response(
                200,
                json={"success": True, "data": {"markdown": "sem email"}},
            )
        return httpx.Response(404)

    p = FirecrawlMapScrapeProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email is None
    assert len(scrape_calls) == MAX_SCRAPES


@pytest.mark.asyncio
async def test_map_returns_no_links():
    """Map vazio → retorna sem email, sem chamar scrape."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/map" in str(req.url):
            return httpx.Response(200, json={"success": True, "links": []})
        pytest.fail("scrape não deveria ter sido chamado")
        return httpx.Response(500)

    p = FirecrawlMapScrapeProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email is None


@pytest.mark.asyncio
async def test_map_http_error_short_circuits():
    """Map dá 500 → retorna sem email, não tenta scrape."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/map" in str(req.url):
            return httpx.Response(500, text="server error")
        pytest.fail("scrape não deveria ter sido chamado")
        return httpx.Response(500)

    p = FirecrawlMapScrapeProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email is None
    assert result.cost_usd == 0.0  # nada consumido


@pytest.mark.asyncio
async def test_individual_scrape_failure_continues():
    """1ª scrape falha → tenta a próxima."""
    scrape_calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/map" in url:
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "links": [
                        "https://empresa.com.br/contato",
                        "https://empresa.com.br/sobre",
                    ],
                },
            )
        if "/scrape" in url:
            import json as _json
            body = _json.loads(req.content.decode())
            scrape_calls.append(body["url"])
            if "contato" in body["url"]:
                return httpx.Response(503, text="upstream error")
            return httpx.Response(
                200,
                json={"success": True, "data": {"markdown": "info@empresa.com.br"}},
            )
        return httpx.Response(404)

    p = FirecrawlMapScrapeProvider(client=_make_client(handler))
    result = await p.find_email({"website": "https://empresa.com.br"})
    assert result is not None
    assert result.email == "info@empresa.com.br"
    assert len(scrape_calls) == 2


@pytest.mark.asyncio
async def test_disabled_via_env(monkeypatch):
    monkeypatch.setenv("ENABLE_FIRECRAWL_MAP_SCRAPE_PROVIDER", "false")
    p = FirecrawlMapScrapeProvider()
    assert await p.find_email({"website": "https://x.com"}) is None
