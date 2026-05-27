"""Testes do dataforseo_service — foco no _normalize_item e na config de base URL.

Não bate em rede real (não temos credenciais DataForSEO ainda).
"""
import importlib
import os

from dataforseo_service import _normalize_item


# ─── _normalize_item ────────────────────────────────────────────────────────


class TestNormalizeItem:
    def test_propagates_contact_url(self):
        item = {
            "title": "Restaurante Bom",
            "phone": "+5511999999999",
            "url": "https://restaurantebom.com.br",
            "contact_url": "https://restaurantebom.com.br/contato",
            "category": "Restaurant",
            "address": "Rua X, 123",
            "rating": {"value": 4.5, "votes_count": 200},
        }
        result = _normalize_item(item, "restaurante")
        assert result["contact_url"] == "https://restaurantebom.com.br/contato"
        assert result["website"] == "https://restaurantebom.com.br"
        assert result["name"] == "Restaurante Bom"
        assert result["rating"] == 4.5
        assert result["reviews_count"] == 200

    def test_contact_url_null_when_absent(self):
        item = {"title": "Sem Contact URL", "url": "https://x.com"}
        result = _normalize_item(item, "loja")
        assert result["contact_url"] is None

    def test_fallback_category(self):
        item = {"title": "X", "url": "https://x.com"}
        result = _normalize_item(item, "barbearia")
        assert result["category"] == "barbearia"

    def test_no_rating_defaults(self):
        item = {"title": "X", "url": "https://x.com"}
        result = _normalize_item(item, "loja")
        assert result["rating"] is None
        assert result["reviews_count"] == 0

    def test_email_always_null(self):
        """DataForSEO Maps NÃO retorna email. Sempre None aqui — enrichment faz o resto."""
        item = {"title": "X", "url": "https://x.com", "email": "should_be_ignored@x.com"}
        result = _normalize_item(item, "loja")
        assert result["email"] is None
        assert result["has_email"] is False


# ─── DATAFORSEO_BASE_URL ────────────────────────────────────────────────────


class TestBaseUrlConfig:
    def test_default_base_url(self, monkeypatch):
        """Sem env var → usa produção."""
        monkeypatch.delenv("DATAFORSEO_BASE_URL", raising=False)
        import dataforseo_service
        importlib.reload(dataforseo_service)
        assert dataforseo_service.DATAFORSEO_BASE_URL == "https://api.dataforseo.com/v3"
        assert dataforseo_service.DATAFORSEO_URL.startswith(
            "https://api.dataforseo.com/v3/serp/google/maps/live/advanced"
        )

    def test_sandbox_base_url(self, monkeypatch):
        """Com env var → usa sandbox."""
        monkeypatch.setenv("DATAFORSEO_BASE_URL", "https://sandbox.dataforseo.com/v3")
        import dataforseo_service
        importlib.reload(dataforseo_service)
        assert dataforseo_service.DATAFORSEO_BASE_URL == "https://sandbox.dataforseo.com/v3"
        assert dataforseo_service.DATAFORSEO_URL == (
            "https://sandbox.dataforseo.com/v3/serp/google/maps/live/advanced"
        )

    def test_trailing_slash_stripped(self, monkeypatch):
        monkeypatch.setenv("DATAFORSEO_BASE_URL", "https://api.dataforseo.com/v3/")
        import dataforseo_service
        importlib.reload(dataforseo_service)
        assert dataforseo_service.DATAFORSEO_BASE_URL == "https://api.dataforseo.com/v3"

    def teardown_method(self, method):
        """Restaura módulo pra estado limpo (default) após cada teste."""
        os.environ.pop("DATAFORSEO_BASE_URL", None)
        import dataforseo_service
        importlib.reload(dataforseo_service)
