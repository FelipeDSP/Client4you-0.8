"""Testes do scrappa_service — foco no _normalize_item.

⚠️ Os fixtures abaixo são `items` REAIS capturados de uma chamada de verdade ao
Scrappa /api/maps/simple-search (query "restaurante em Ariquemes RO",
2026-07-20), NÃO mocks inventados (disciplina do ADR-001 D1). Se o Scrappa mudar
o shape, recapture com `backend/scripts/smoke_test_scrappa.py` e atualize aqui.

Não bate em rede (só exercita a normalização sobre o JSON real).
"""
from scrappa_service import _normalize_item, MAX_DEPTH


# ─── Fixtures REAIS (items capturados da API) ───────────────────────────────

# Sem website, com telefone. Note: `type` genérico ("restaurantes"), categoria
# específica em subtypes[0] ("Restaurante").
ITEM_SEM_WEBSITE = {
    "name": "Restaurante e Churrascaria Boi na Brasa",
    "phone_numbers": ["(69) 3536-8126"],
    "full_address": "Av. Candeias, 1835 - Áreas Especiais, Ariquemes - RO, 76870-241",
    "website": None,
    "domain": None,
    "rating": 4.4,
    "review_count": 893,
    "type": "restaurantes",
    "subtypes": ["Restaurante", "Churrascaria"],
    "business_id": "0x93cc90bf38241321:0x92b4ed6848f63db9",
}

# Com website (Instagram) e telefone.
ITEM_COM_WEBSITE = {
    "name": "Restaurante Fogão a Lenha",
    "phone_numbers": ["(69) 99955-6505"],
    "full_address": "Av. Cap. Silvio, 2948 - Grandes Áreas, Ariquemes - RO, 76876-690",
    "website": "https://www.instagram.com/fogaoalenha.ariquemes?igsh=aDQxaW00aWc2ejlw",
    "rating": 4.5,
    "review_count": 924,
    "type": "restaurantes",
    "subtypes": ["Churrascaria", "Restaurante brasileiro", "Restaurante"],
}

# phone_numbers VAZIO e sem website.
ITEM_SEM_PHONE = {
    "name": "Churrascaria Premium",
    "phone_numbers": [],
    "full_address": "R. Yuri Gagare - St. 08, Ariquemes - RO, 76873-366",
    "website": None,
    "rating": 4.8,
    "review_count": 25,
    "type": "restaurantes",
    "subtypes": ["Churrascaria"],
}


class TestNormalizeItem:
    def test_item_completo(self):
        result = _normalize_item(ITEM_COM_WEBSITE, "restaurante")
        assert result["name"] == "Restaurante Fogão a Lenha"
        assert result["phone"] == "(69) 99955-6505"
        assert result["website"] == (
            "https://www.instagram.com/fogaoalenha.ariquemes?igsh=aDQxaW00aWc2ejlw"
        )
        assert result["address"].startswith("Av. Cap. Silvio")
        assert result["rating"] == 4.5
        assert result["reviews_count"] == 924

    def test_produz_exatamente_as_chaves_da_tabela_leads(self):
        """Paridade de contrato com dataforseo_service._normalize_item."""
        result = _normalize_item(ITEM_COM_WEBSITE, "restaurante")
        assert set(result.keys()) == {
            "name", "phone", "address", "website", "rating", "reviews_count",
            "category", "has_whatsapp", "email", "has_email", "contact_url",
        }

    def test_category_usa_subtypes_nao_type(self):
        """`type` é o termo de busca genérico ('restaurantes'), igual pra todos.
        A categoria específica do negócio está em subtypes[0]."""
        assert _normalize_item(ITEM_SEM_WEBSITE, "x")["category"] == "Restaurante"
        assert _normalize_item(ITEM_SEM_PHONE, "x")["category"] == "Churrascaria"

    def test_category_fallback_para_type_depois_query(self):
        assert _normalize_item({"name": "X", "type": "salão"}, "fb")["category"] == "salão"
        assert _normalize_item({"name": "X"}, "fb")["category"] == "fb"

    def test_phone_do_primeiro_do_array(self):
        assert _normalize_item(ITEM_SEM_WEBSITE, "x")["phone"] == "(69) 3536-8126"

    def test_phone_null_quando_array_vazio(self):
        result = _normalize_item(ITEM_SEM_PHONE, "x")
        assert result["phone"] is None
        assert result["name"] == "Churrascaria Premium"
        assert result["reviews_count"] == 25

    def test_website_null_quando_ausente(self):
        assert _normalize_item(ITEM_SEM_WEBSITE, "x")["website"] is None

    def test_campos_nao_fornecidos_pelo_scrappa(self):
        """Scrappa Maps não dá email/whatsapp/contact_url — devem ser coerentes."""
        result = _normalize_item(ITEM_COM_WEBSITE, "restaurante")
        assert result["has_whatsapp"] is False
        assert result["email"] is None
        assert result["has_email"] is False
        assert result["contact_url"] is None

    def test_reviews_count_zero_quando_ausente(self):
        result = _normalize_item({"name": "Novo"}, "loja")
        assert result["reviews_count"] == 0
        assert result["rating"] is None


class TestMaxDepth:
    def test_max_depth_reflete_cap_do_simple_search(self):
        """Scrappa simple-search: limit 1..200 numa request (doc + chamada real)."""
        assert MAX_DEPTH == 200
