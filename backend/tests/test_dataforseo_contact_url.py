"""Testes do DataForSEOContactUrlProvider.

Usa `httpx.MockTransport` pra simular respostas HTTP — não bate em rede real.
"""
import pytest
import httpx

from services.email_providers.dataforseo_contact_url import (
    DataForSEOContactUrlProvider,
)


def _make_client(handler) -> httpx.AsyncClient:
    """Cria AsyncClient com MockTransport injetado — pra testes."""
    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        timeout=5.0,
        follow_redirects=True,
    )


# ─── Casos básicos ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_none_when_no_contact_url():
    """Sem `contact_url` no lead, provider não é aplicável."""
    p = DataForSEOContactUrlProvider()
    result = await p.find_email({"website": "https://x.com"})
    assert result is None


@pytest.mark.asyncio
async def test_finds_email_in_html():
    """HTML simples com email → encontra e retorna."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text="<html><body>Fale com contato@empresa.com.br</body></html>",
        )

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    lead = {
        "contact_url": "https://empresa.com.br/contato",
        "website": "https://empresa.com.br",
    }
    result = await p.find_email(lead)
    assert result is not None
    assert result.email == "contato@empresa.com.br"
    assert result.source == "dataforseo_contact_url"
    assert result.confidence > 0.5
    assert result.cost_usd == 0.0


@pytest.mark.asyncio
async def test_prefers_corporate_email_over_personal():
    """Multiple emails → pick_best ordena pelo score."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text="""
                <p>contato@empresa.com.br</p>
                <p>joao.silva@empresa.com.br</p>
            """,
        )

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    lead = {
        "contact_url": "https://empresa.com.br/contato",
        "website": "https://empresa.com.br",
    }
    result = await p.find_email(lead)
    assert result is not None
    assert result.email == "contato@empresa.com.br"


@pytest.mark.asyncio
async def test_filters_blacklisted_emails():
    """Só noreply e wordpress no HTML → retorna sem email."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text="<p>noreply@empresa.com.br</p><p>wordpress@hostgator.com.br</p>",
        )

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    lead = {
        "contact_url": "https://empresa.com.br/contato",
        "website": "https://empresa.com.br",
    }
    result = await p.find_email(lead)
    assert result is not None
    assert result.email is None  # tentou mas filtrou
    assert result.cost_usd == 0.0


@pytest.mark.asyncio
async def test_handles_404():
    """HTTP 404 → não crash, retorna sem email."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="Not Found")

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    lead = {
        "contact_url": "https://empresa.com.br/nao-existe",
        "website": "https://empresa.com.br",
    }
    result = await p.find_email(lead)
    assert result is not None
    assert result.email is None


@pytest.mark.asyncio
async def test_handles_network_error():
    """ConnectError → captura, retorna EmailResult com email=None."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("simulated connection failure")

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    lead = {
        "contact_url": "https://empresa.com.br/contato",
        "website": "https://empresa.com.br",
    }
    result = await p.find_email(lead)
    assert result is not None
    assert result.email is None
    assert result.source == "dataforseo_contact_url"


@pytest.mark.asyncio
async def test_no_email_in_html():
    """HTML sem nenhum email → tentou mas não achou."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<p>Use o formulário pra entrar em contato</p>")

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    lead = {
        "contact_url": "https://empresa.com.br/contato",
        "website": "https://empresa.com.br",
    }
    result = await p.find_email(lead)
    assert result is not None
    assert result.email is None


@pytest.mark.asyncio
async def test_obfuscated_email_in_html_br():
    """Email ofuscado em PT → desofusca e extrai."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text="<p>Fale: contato [arroba] empresa [ponto] com [ponto] br</p>",
        )

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    lead = {
        "contact_url": "https://empresa.com.br/contato",
        "website": "https://empresa.com.br",
    }
    result = await p.find_email(lead)
    assert result is not None
    assert result.email == "contato@empresa.com.br"


# ─── Env var toggle ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_disabled_via_env(monkeypatch):
    """ENABLE_DATAFORSEO_CONTACT_URL_PROVIDER=false → retorna None imediato."""
    monkeypatch.setenv("ENABLE_DATAFORSEO_CONTACT_URL_PROVIDER", "false")
    p = DataForSEOContactUrlProvider()
    result = await p.find_email({"contact_url": "https://x.com/c", "website": "https://x.com"})
    assert result is None


# ─── PR 3: extracted_cnpjs ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_extracts_cnpj_from_html_along_with_email():
    """Página com email + CNPJ no rodapé → ambos vêm no resultado."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text="""
                <p>Contato: contato@empresa.com.br</p>
                <footer>CNPJ 11.222.333/0001-81</footer>
            """,
        )

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    result = await p.find_email({
        "contact_url": "https://empresa.com.br/contato",
        "website": "https://empresa.com.br",
    })
    assert result is not None
    assert result.email == "contato@empresa.com.br"
    assert result.extracted_cnpjs == ["11222333000181"]


@pytest.mark.asyncio
async def test_extracts_cnpj_even_when_no_email_found():
    """Sem email mas com CNPJ → email=None mas extracted_cnpjs preenchido."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text="<footer>CNPJ 11.222.333/0001-81 — use o formulário</footer>",
        )

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    result = await p.find_email({
        "contact_url": "https://empresa.com.br/contato",
        "website": "https://empresa.com.br",
    })
    assert result is not None
    assert result.email is None
    assert result.extracted_cnpjs == ["11222333000181"]


@pytest.mark.asyncio
async def test_invalid_cnpj_filtered():
    """CNPJ com DV errado no HTML não vai pro extracted_cnpjs."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text="<footer>CNPJ 12.345.678/9012-34 (inválido)</footer>",
        )

    p = DataForSEOContactUrlProvider(client=_make_client(handler))
    result = await p.find_email({
        "contact_url": "https://x.com/c",
        "website": "https://x.com",
    })
    assert result is not None
    assert result.extracted_cnpjs == []
