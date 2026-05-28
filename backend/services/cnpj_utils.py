"""Utilitários de CNPJ — extração de texto, validação de dígito verificador,
normalização.

Implementa o algoritmo oficial do dígito verificador da Receita Federal sem
dependência externa (não precisa do `python-stdnum`, que é dependência pesada
e teria que validar mil países).

Por que `services/` e não `email_providers/`: CNPJ não é conceito de email —
serve pro ReceitaFederalMetadataProvider (em `metadata_enrichment/`), pro
endpoint manual de input, pra eventual dedup, pra futuros providers de CPF.
"""
from __future__ import annotations

import re
from typing import Optional


# Aceita formatos `12.345.678/0001-90` e `12345678000190`.
CNPJ_RE = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b")

# Pesos pra cálculo dos dígitos verificadores (algoritmo oficial RF).
_WEIGHTS_DV1: tuple[int, ...] = (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
_WEIGHTS_DV2: tuple[int, ...] = (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)


def _dv_from_weights(digits: str, weights: tuple[int, ...]) -> int:
    """Calcula um dígito verificador dado os dígitos e os pesos."""
    total = sum(int(d) * w for d, w in zip(digits, weights))
    rem = total % 11
    return 0 if rem < 2 else 11 - rem


def validate_cnpj_dv(digits: str) -> bool:
    """Valida os 2 dígitos verificadores de um CNPJ (14 dígitos, sem máscara).

    Rejeita também CNPJs com todos os dígitos iguais (`00000000000000`,
    `11111111111111` etc.) — passam no DV mas são inválidos por convenção.
    """
    if not digits or len(digits) != 14 or not digits.isdigit():
        return False
    # Todos os dígitos iguais: matematicamente válidos no DV, mas inválidos
    # por convenção (Receita não emite CNPJ assim).
    if digits == digits[0] * 14:
        return False

    if int(digits[12]) != _dv_from_weights(digits[:12], _WEIGHTS_DV1):
        return False
    if int(digits[13]) != _dv_from_weights(digits[:13], _WEIGHTS_DV2):
        return False
    return True


def normalize_cnpj(raw: Optional[str]) -> Optional[str]:
    """Remove máscara, valida tamanho e DV. Retorna 14 dígitos ou None.

    Use sempre que receber CNPJ vindo do usuário ou de fonte externa antes
    de persistir.
    """
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) != 14:
        return None
    if not validate_cnpj_dv(digits):
        return None
    return digits


def extract_cnpjs(text: Optional[str], validate: bool = False) -> list[str]:
    """Extrai CNPJs de um texto, lowercase digits, dedup preservando ordem.

    Args:
        text: o texto a vasculhar (markdown, HTML, etc.)
        validate: se True, valida dígito verificador antes de incluir.
            Use True ao extrair passivamente de scrape (evita persistir lixo
            que casou no regex mas não é CNPJ real).
    """
    if not text:
        return []
    raw = CNPJ_RE.findall(text)
    seen: set[str] = set()
    result: list[str] = []
    for c in raw:
        digits = re.sub(r"\D", "", c)
        if len(digits) != 14:
            continue
        if validate and not validate_cnpj_dv(digits):
            continue
        if digits in seen:
            continue
        seen.add(digits)
        result.append(digits)
    return result


def format_cnpj(digits: str) -> str:
    """Formata 14 dígitos como `12.345.678/0001-90`. Use só pra display."""
    if len(digits) != 14 or not digits.isdigit():
        return digits
    return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:14]}"
