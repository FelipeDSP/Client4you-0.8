#!/usr/bin/env python3
"""Smoke test do DataForSEO Google Maps Live Advanced.

Roda uma busca real (sandbox ou produção) e valida que a estrutura do
response bate com o que o `dataforseo_service._normalize_item` espera —
incluindo os campos novos `contact_url` e `domain`.

Uso:

    # Sandbox (precisa de credenciais válidas DataForSEO; dados são dummy):
    export DATAFORSEO_LOGIN=seu_login
    export DATAFORSEO_PASSWORD=sua_password
    export DATAFORSEO_BASE_URL=https://sandbox.dataforseo.com/v3
    python backend/scripts/smoke_test_dataforseo.py

    # Produção (consome créditos!):
    unset DATAFORSEO_BASE_URL
    python backend/scripts/smoke_test_dataforseo.py

Saída: imprime as chaves do primeiro `item` retornado e valida presença dos
campos críticos. Exit code 0 = ok, 1 = problema.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
from pathlib import Path

# sys.path: deixa importar o módulo do backend sem instalar
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import httpx  # noqa: E402

BASE_URL = os.getenv("DATAFORSEO_BASE_URL", "https://api.dataforseo.com/v3").rstrip("/")
URL = f"{BASE_URL}/serp/google/maps/live/advanced"

REQUIRED_ITEM_KEYS = {"title", "phone", "url"}
EXPECTED_ITEM_KEYS = {"contact_url", "domain", "category", "rating", "address"}


async def main() -> int:
    login = os.getenv("DATAFORSEO_LOGIN")
    password = os.getenv("DATAFORSEO_PASSWORD")
    if not login or not password:
        print("ERRO: defina DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD")
        return 1

    creds = base64.b64encode(f"{login}:{password}".encode()).decode()
    payload = [{
        "keyword": "restaurantes em Sao Paulo",
        "location_name": "Brazil",
        "language_name": "Portuguese",
        "depth": 10,
    }]

    print(f"→ POST {URL}")
    print(f"  query: {payload[0]['keyword']!r}, depth={payload[0]['depth']}")

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(
                URL,
                headers={
                    "Authorization": f"Basic {creds}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        except httpx.HTTPError as e:
            print(f"ERRO de rede: {type(e).__name__}: {e}")
            return 1

    print(f"← HTTP {resp.status_code}")
    if resp.status_code != 200:
        print(f"BODY: {resp.text[:500]}")
        return 1

    data = resp.json()
    if data.get("status_code") != 20000:
        print(f"DataForSEO erro raiz: {data.get('status_message')} (code={data.get('status_code')})")
        return 1

    tasks = data.get("tasks") or []
    if not tasks or tasks[0].get("status_code") != 20000:
        msg = tasks[0].get("status_message") if tasks else "sem tasks"
        print(f"Task falhou: {msg}")
        return 1

    results = tasks[0].get("result") or []
    items = (results[0] or {}).get("items") or [] if results else []
    if not items:
        print("Sem items no result. Pode ser query sem matches em sandbox.")
        return 1

    item = items[0]
    print("\n--- PRIMEIRO ITEM (chaves) ---")
    for k in sorted(item.keys()):
        v = item[k]
        preview = json.dumps(v)[:80] if not isinstance(v, str) else v[:80]
        print(f"  {k}: {preview}")

    missing_required = REQUIRED_ITEM_KEYS - set(item.keys())
    if missing_required:
        print(f"\n❌ CRÍTICO: faltam chaves obrigatórias: {missing_required}")
        return 1

    missing_expected = EXPECTED_ITEM_KEYS - set(item.keys())
    if missing_expected:
        print(f"\n⚠️  AVISO: faltam chaves esperadas (pode não ter neste item específico):")
        for k in missing_expected:
            print(f"    - {k}")
    else:
        print("\n✅ Todas as chaves esperadas presentes (incluindo contact_url e domain).")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
