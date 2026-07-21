#!/usr/bin/env python3
"""Smoke test do Scrappa.co Google Maps (simple-search).

Faz UMA busca REAL e imprime:
  1. o JSON de resposta CRU (pra mapearmos os campos a partir do que o Scrappa
     realmente retorna — NÃO de um mock inventado, ver ADR-001 D1);
  2. a lista normalizada por `scrappa_service._normalize_item`.

Compare os dois: se algum campo normalizado vier None/0 mas existir no JSON cru
com outro nome, ajuste `scrappa_service._normalize_item`.

Uso (PowerShell):
    $env:SCRAPPA_API_KEY="sua_chave"
    python backend/scripts/smoke_test_scrappa.py

Exit code 0 = ok, 1 = problema.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

# Console do Windows é cp1252 e engasga com →/✅/⚠️. Força UTF-8 na saída.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# Deixa importar o módulo do backend sem instalar
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import httpx  # noqa: E402

from scrappa_service import _normalize_item, SCRAPPA_MAPS_URL  # noqa: E402

QUERY = "restaurante"
LOCATION = "Ariquemes RO"
LIMIT = 50  # pede um lote maior pra confirmar que o limit é honrado (até 200)


async def main() -> int:
    api_key = os.getenv("SCRAPPA_API_KEY")
    if not api_key:
        print("ERRO: defina SCRAPPA_API_KEY antes de rodar.")
        return 1

    keyword = f"{QUERY} em {LOCATION}"
    params = {"query": keyword, "limit": LIMIT, "gl": "br", "hl": "pt-br"}

    print(f"→ GET {SCRAPPA_MAPS_URL}")
    print(f"  params: {json.dumps(params, ensure_ascii=False)}")

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.get(
                SCRAPPA_MAPS_URL,
                headers={"x-api-key": api_key},
                params=params,
            )
        except httpx.HTTPError as e:
            print(f"ERRO de rede: {type(e).__name__}: {e}")
            return 1

    print(f"← HTTP {resp.status_code}")
    if resp.status_code != 200:
        print(f"BODY: {resp.text[:800]}")
        return 1

    data = resp.json()

    print("\n=== JSON CRU (resposta completa) ===")
    print(json.dumps(data, ensure_ascii=False, indent=2))

    items = data.get("items") or []
    print(f"\n=== items: {len(items)} (pedimos limit={LIMIT}) ===")
    if items:
        print("--- chaves do primeiro item ---")
        for k in sorted(items[0].keys()):
            print(f"  {k}: {json.dumps(items[0][k], ensure_ascii=False)[:100]}")

    print("\n=== LISTA NORMALIZADA (_normalize_item) ===")
    normalized = [_normalize_item(it, QUERY) for it in items if it.get("name")]
    print(json.dumps(normalized, ensure_ascii=False, indent=2))

    if not items:
        print("\n⚠️  Sem items — não dá pra validar o mapeamento. "
              "Tente outra query/localização.")
        return 1

    print(f"\n✅ {len(normalized)} leads normalizados de {len(items)} items. "
          f"Confira se os campos batem com o JSON cru.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
