"""Testes do ReceitaFederalMetadataProvider — mocka BrasilAPI /api/cnpj/v1/{cnpj}.

Refactor PR 4: provider deixou de procurar email (BrasilAPI retorna email=None
em ~100% dos casos reais). Agora popula metadata: telefone, razão social,
CNAE, porte, situação cadastral, QSA.

CNPJ válido usado em todos os testes: 11.222.333/0001-81 (11222333000181).
"""
import httpx
import pytest

from services.metadata_enrichment.receita_federal import (
    ReceitaFederalMetadataProvider,
)


_VALID_CNPJ = "11222333000181"


def _make_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=5.0)


def _full_payload() -> dict:
    """Payload típico do BrasilAPI (campos relevantes pro provider)."""
    return {
        "cnpj": _VALID_CNPJ,
        "razao_social": "EMPRESA TESTE LTDA",
        "nome_fantasia": "Empresa Teste",
        "cnae_fiscal_descricao": "Comércio varejista de produtos diversos",
        "porte": "DEMAIS",
        "descricao_porte": "DEMAIS",
        "descricao_situacao_cadastral": "ATIVA",
        "ddd_telefone_1": "1133334444",
        "ddd_telefone_2": "",
        "email": None,  # LGPD: BrasilAPI quase nunca devolve email real
        "qsa": [
            {"nome_socio": "JOAO DA SILVA", "qualificacao_socio": "Administrador"},
            {"nome_socio": "MARIA SOUZA", "qualificacao_socio": "Sócia"},
        ],
    }


# ─── Aplicabilidade ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_none_without_cnpj():
    p = ReceitaFederalMetadataProvider()
    assert await p.enrich({"website": "https://x.com"}) is None


@pytest.mark.asyncio
async def test_returns_none_with_invalid_cnpj():
    """CNPJ com DV errado → normalize falha → provider não aplicável."""
    p = ReceitaFederalMetadataProvider()
    assert await p.enrich({"cnpj": "12345678901234"}) is None


@pytest.mark.asyncio
async def test_disabled_via_env(monkeypatch):
    monkeypatch.setenv("ENABLE_RECEITA_FEDERAL_PROVIDER", "false")
    p = ReceitaFederalMetadataProvider()
    assert await p.enrich({"cnpj": _VALID_CNPJ}) is None


# ─── Happy path ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_populates_all_metadata_fields():
    """Payload completo → todos os campos preenchidos no MetadataResult."""
    def handler(req: httpx.Request) -> httpx.Response:
        assert _VALID_CNPJ in str(req.url)
        return httpx.Response(200, json=_full_payload())

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.source == "receita_federal"
    assert result.cost_usd == 0.0
    assert result.phone == "1133334444"
    assert result.razao_social == "EMPRESA TESTE LTDA"
    assert result.nome_fantasia == "Empresa Teste"
    assert result.cnae == "Comércio varejista de produtos diversos"
    assert result.porte == "DEMAIS"
    assert result.situacao_cadastral == "ATIVA"
    assert result.qsa is not None
    assert len(result.qsa) == 2
    assert result.qsa[0]["nome_socio"] == "JOAO DA SILVA"


@pytest.mark.asyncio
async def test_accepts_masked_cnpj_in_lead():
    """Lead com CNPJ formatado (12.345.678/0001-90) — provider deve normalizar."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"razao_social": "X LTDA"})

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": "11.222.333/0001-81"})
    assert result is not None
    assert result.razao_social == "X LTDA"


@pytest.mark.asyncio
async def test_phone_falls_back_to_telefone_2():
    """ddd_telefone_1 vazio → usa ddd_telefone_2."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"ddd_telefone_1": "", "ddd_telefone_2": "1144445555"},
        )

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.phone == "1144445555"


@pytest.mark.asyncio
async def test_phone_with_mask_normalized():
    """Telefone com máscara `(11) 3333-4444` → só dígitos."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ddd_telefone_1": "(11) 3333-4444"})

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.phone == "1133334444"


@pytest.mark.asyncio
async def test_invalid_phone_length_dropped():
    """Telefone com 7 dígitos (lixo) → phone fica None, não polui o lead."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ddd_telefone_1": "1234567"})

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.phone is None


# ─── Empty / sem dados ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_empty_payload_returns_metadata_with_all_none():
    """Receita responde 200 mas sem nada útil → MetadataResult com tudo None."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"cnpj": _VALID_CNPJ})

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.phone is None
    assert result.razao_social is None
    assert result.qsa is None
    assert result.source == "receita_federal"


@pytest.mark.asyncio
async def test_qsa_non_list_ignored():
    """QSA vindo como string ou null (erro upstream) → ignorado."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"qsa": "lixo string"})

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.qsa is None


# ─── Erros HTTP ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_404_cnpj_not_found():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "CNPJ não encontrado"})

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.razao_social is None
    assert result.phone is None


@pytest.mark.asyncio
async def test_429_rate_limited():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"message": "rate limited"})

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.razao_social is None


@pytest.mark.asyncio
async def test_5xx_error():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream timeout")

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.razao_social is None


@pytest.mark.asyncio
async def test_network_error():
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("simulated")

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.source == "receita_federal"
    assert result.razao_social is None


@pytest.mark.asyncio
async def test_invalid_json_response():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not json")

    p = ReceitaFederalMetadataProvider(client=_make_client(handler))
    result = await p.enrich({"cnpj": _VALID_CNPJ})
    assert result is not None
    assert result.razao_social is None
