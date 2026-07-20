#!/usr/bin/env python3
"""Smoke test do Serper.dev Google Maps.

Faz UMA busca REAL e imprime:
  1. o JSON de resposta CRU (pra mapearmos os campos a partir do que o Serper
     realmente retorna — NÃO de um mock inventado, ver ADR-001 D1);
  2. a lista normalizada por `serper_service._normalize_item`.

Compare os dois: se algum campo normalizado vier None/0 mas existir no JSON cru
com outro nome, ajuste `serper_service._normalize_item`.

Uso (PowerShell):
    $env:SERPER_API_KEY="sua_chave"
    python backend/scripts/smoke_test_serper.py

Uso (bash):
    export SERPER_API_KEY=sua_chave
    python backend/scripts/smoke_test_serper.py

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

from serper_service import _normalize_item, SERPER_MAPS_URL  # noqa: E402

QUERY = "restaurante"
LOCATION = "Ariquemes RO"


async def main() -> int:
    api_key = os.getenv("SERPER_API_KEY")
    if not api_key:
        print("ERRO: defina SERPER_API_KEY antes de rodar.")
        return 1

    keyword = f"{QUERY} em {LOCATION}"
    payload = {"q": keyword, "gl": "br", "hl": "pt-br"}

    print(f"→ POST {SERPER_MAPS_URL}")
    print(f"  payload: {json.dumps(payload, ensure_ascii=False)}")

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(
                SERPER_MAPS_URL,
                headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                json=payload,
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

    places = data.get("places") or []
    print(f"\n=== places: {len(places)} ===")
    if places:
        print("--- chaves do primeiro place ---")
        for k in sorted(places[0].keys()):
            print(f"  {k}: {json.dumps(places[0][k], ensure_ascii=False)[:100]}")

    print("\n=== LISTA NORMALIZADA (_normalize_item) ===")
    normalized = [_normalize_item(it, QUERY) for it in places if it.get("title")]
    print(json.dumps(normalized, ensure_ascii=False, indent=2))

    if not places:
        print("\n⚠️  Sem places — não dá pra validar o mapeamento. "
              "Tente outra query/localização.")
        return 1

    print(f"\n✅ {len(normalized)} leads normalizados. "
          f"Confira acima se os campos batem com o JSON cru.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
