"""Testes do serper_service — foco no _normalize_item.

⚠️ Os fixtures abaixo são `places` REAIS capturados de uma chamada de verdade ao
Serper /maps (query "restaurante em Ariquemes RO", 2026-07-20), NÃO mocks
inventados (disciplina do ADR-001 D1). Se o Serper mudar o shape da resposta,
recapture com `backend/scripts/smoke_test_serper.py` e atualize aqui.

Não bate em rede (só exercita a normalização sobre o JSON real).
"""
from serper_service import _normalize_item, MAX_DEPTH


# ─── Fixtures REAIS (places capturados da API) ──────────────────────────────

# Place completo com website (Instagram) e telefone.
PLACE_COM_WEBSITE = {
    "position": 2,
    "title": "Restaurante Fogão a Lenha",
    "address": "Av. Cap. Silvio, 2948 - Grandes Áreas, Ariquemes - RO, 76876-690, Brasil",
    "latitude": -9.9206401,
    "longitude": -63.0391938,
    "rating": 4.5,
    "ratingCount": 924,
    "priceLevel": "R$ 20–40",
    "type": "Churrascaria",
    "types": ["Churrascaria", "Restaurante brasileiro", "Restaurante"],
    "website": "https://www.instagram.com/fogaoalenha.ariquemes?igsh=aDQxaW00aWc2ejlw",
    "phoneNumber": "+55 69 99955-6505",
    "cid": "8914852032030098926",
    "placeId": "ChIJbwac2eyQzJMR7sVSsrDqt3s",
}

# Place SEM website (tem telefone).
PLACE_SEM_WEBSITE = {
    "position": 1,
    "title": "Restaurante e Churrascaria Boi na Brasa",
    "address": "Av. Candeias, 1835 - Áreas Especiais, Ariquemes - RO, 76870-241, Brasil",
    "rating": 4.4,
    "ratingCount": 893,
    "type": "Restaurante",
    "types": ["Restaurante", "Churrascaria"],
    "phoneNumber": "+55 69 3536-8126",
    "cid": "10571335257501875641",
}

# Place SEM telefone E sem website.
PLACE_SEM_PHONE = {
    "position": 5,
    "title": "Churrascaria Premium",
    "address": "R. Yuri Gagare - St. 08, Ariquemes - RO, 76873-366, Brasil",
    "rating": 4.8,
    "ratingCount": 25,
    "type": "Churrascaria",
    "types": ["Churrascaria"],
    "cid": "2269464423995687854",
}


class TestNormalizeItem:
    def test_place_completo(self):
        result = _normalize_item(PLACE_COM_WEBSITE, "restaurante")
        assert result["name"] == "Restaurante Fogão a Lenha"
        assert result["phone"] == "+55 69 99955-6505"
        assert result["website"] == (
            "https://www.instagram.com/fogaoalenha.ariquemes?igsh=aDQxaW00aWc2ejlw"
        )
        assert result["address"].startswith("Av. Cap. Silvio")
        assert result["rating"] == 4.5
        assert result["reviews_count"] == 924
        assert result["category"] == "Churrascaria"

    def test_produz_exatamente_as_chaves_da_tabela_leads(self):
        """Paridade de contrato com dataforseo_service._normalize_item."""
        result = _normalize_item(PLACE_COM_WEBSITE, "restaurante")
        assert set(result.keys()) == {
            "name", "phone", "address", "website", "rating", "reviews_count",
            "category", "has_whatsapp", "email", "has_email", "contact_url",
        }

    def test_website_null_quando_ausente(self):
        result = _normalize_item(PLACE_SEM_WEBSITE, "restaurante")
        assert result["website"] is None
        assert result["phone"] == "+55 69 3536-8126"

    def test_phone_null_quando_ausente(self):
        result = _normalize_item(PLACE_SEM_PHONE, "restaurante")
        assert result["phone"] is None
        assert result["website"] is None
        assert result["name"] == "Churrascaria Premium"
        assert result["reviews_count"] == 25

    def test_category_usa_type_do_serper(self):
        """`type` do Serper vira category; fallback só se ausente."""
        assert _normalize_item(PLACE_SEM_WEBSITE, "fallback")["category"] == "Restaurante"
        assert _normalize_item({"title": "X"}, "fallback")["category"] == "fallback"

    def test_campos_nao_fornecidos_pelo_serper(self):
        """Serper Maps não dá email/whatsapp/contact_url — devem ser coerentes."""
        result = _normalize_item(PLACE_COM_WEBSITE, "restaurante")
        assert result["has_whatsapp"] is False
        assert result["email"] is None
        assert result["has_email"] is False
        assert result["contact_url"] is None

    def test_reviews_count_zero_quando_ausente(self):
        result = _normalize_item({"title": "Sem avaliações"}, "loja")
        assert result["reviews_count"] == 0
        assert result["rating"] is None


class TestMaxDepth:
    def test_max_depth_reflete_cap_de_uma_chamada(self):
        """Serper /maps: cap ~20 places por query (sem paginação — ver ADR-002)."""
        assert MAX_DEPTH == 20
