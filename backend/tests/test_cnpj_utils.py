"""Testes do módulo `services.cnpj_utils` — extração, validação de DV,
normalização.

CNPJs válidos de teste (verificados pelo algoritmo oficial RF):
- 11.222.333/0001-81 → 11222333000181
- 33.000.167/0001-01 → 33000167000101 (Petrobras-like)
"""
from services.cnpj_utils import (
    extract_cnpjs,
    format_cnpj,
    normalize_cnpj,
    validate_cnpj_dv,
)


# ─── validate_cnpj_dv ──────────────────────────────────────────────────────


class TestValidateCnpjDv:
    def test_valid_cnpj_1(self):
        assert validate_cnpj_dv("11222333000181") is True

    def test_valid_cnpj_2(self):
        assert validate_cnpj_dv("33000167000101") is True

    def test_invalid_wrong_dv(self):
        # 12345678901234 — DV reais seriam 30 (último dígito 4 está errado)
        assert validate_cnpj_dv("12345678901234") is False

    def test_all_zeros_rejected(self):
        assert validate_cnpj_dv("00000000000000") is False

    def test_all_ones_rejected(self):
        # Matematicamente passa no DV mas é convenção rejeitar
        assert validate_cnpj_dv("11111111111111") is False

    def test_all_nines_rejected(self):
        assert validate_cnpj_dv("99999999999999") is False

    def test_too_short(self):
        assert validate_cnpj_dv("123") is False

    def test_too_long(self):
        assert validate_cnpj_dv("112223330001810") is False

    def test_non_digit(self):
        assert validate_cnpj_dv("11.222.333/0001-81") is False  # com máscara não passa

    def test_empty(self):
        assert validate_cnpj_dv("") is False


# ─── normalize_cnpj ─────────────────────────────────────────────────────────


class TestNormalizeCnpj:
    def test_masked_valid(self):
        assert normalize_cnpj("11.222.333/0001-81") == "11222333000181"

    def test_unmasked_valid(self):
        assert normalize_cnpj("11222333000181") == "11222333000181"

    def test_with_extra_spaces(self):
        assert normalize_cnpj("  11.222.333/0001-81  ") == "11222333000181"

    def test_invalid_dv_returns_none(self):
        assert normalize_cnpj("12345678901234") is None

    def test_all_same_returns_none(self):
        assert normalize_cnpj("11111111111111") is None
        assert normalize_cnpj("11.111.111/1111-11") is None

    def test_too_short_returns_none(self):
        assert normalize_cnpj("1234") is None

    def test_empty_or_none(self):
        assert normalize_cnpj("") is None
        assert normalize_cnpj(None) is None

    def test_letters_stripped_then_validated(self):
        # "abc11.222.333/0001-81xyz" → digits ainda formam CNPJ válido
        assert normalize_cnpj("abc11.222.333/0001-81xyz") == "11222333000181"

    def test_only_letters_returns_none(self):
        assert normalize_cnpj("abcdefghij") is None


# ─── extract_cnpjs ──────────────────────────────────────────────────────────


class TestExtractCnpjs:
    def test_masked_in_text(self):
        text = "Empresa CNPJ 11.222.333/0001-81 com matriz em SP"
        assert extract_cnpjs(text) == ["11222333000181"]

    def test_unmasked_in_text(self):
        text = "CNPJ 11222333000181 inscrito"
        assert extract_cnpjs(text) == ["11222333000181"]

    def test_multiple_dedup(self):
        text = "Matriz 11.222.333/0001-81 — filial 11222333000181"
        assert extract_cnpjs(text) == ["11222333000181"]

    def test_multiple_distinct(self):
        text = "Matriz 11.222.333/0001-81 e parceira 33.000.167/0001-01"
        result = extract_cnpjs(text)
        assert "11222333000181" in result
        assert "33000167000101" in result
        assert len(result) == 2

    def test_validate_false_accepts_invalid_dv(self):
        # Default validate=False: regex casa, retorna sem validar DV
        text = "CNPJ 12.345.678/9012-34"
        assert extract_cnpjs(text) == ["12345678901234"]

    def test_validate_true_rejects_invalid_dv(self):
        text = "CNPJ 12.345.678/9012-34"
        assert extract_cnpjs(text, validate=True) == []

    def test_validate_true_keeps_valid(self):
        text = "CNPJ 11.222.333/0001-81 e 33.000.167/0001-01"
        result = extract_cnpjs(text, validate=True)
        assert "11222333000181" in result
        assert "33000167000101" in result

    def test_validate_true_rejects_all_same(self):
        text = "CNPJ 11.111.111/1111-11 (lixo)"
        assert extract_cnpjs(text, validate=True) == []

    def test_invalid_length_ignored(self):
        assert extract_cnpjs("123") == []

    def test_empty(self):
        assert extract_cnpjs("") == []
        assert extract_cnpjs(None) == []


# ─── format_cnpj ────────────────────────────────────────────────────────────


class TestFormatCnpj:
    def test_formats(self):
        assert format_cnpj("11222333000181") == "11.222.333/0001-81"

    def test_invalid_length_returns_as_is(self):
        # Fallback defensivo — função é só de display
        assert format_cnpj("123") == "123"

    def test_non_digit_returns_as_is(self):
        assert format_cnpj("abc") == "abc"
