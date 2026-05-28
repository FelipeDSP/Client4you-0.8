import httpx, json
r = httpx.get("https://brasilapi.com.br/api/cnpj/v1/47960950000121", timeout=15)
print("STATUS:", r.status_code)
d = r.json()
print("\n--- TODAS AS CHAVES DO PAYLOAD ---")
for k in sorted(d.keys()):
    v = d[k]
    if isinstance(v, (list, dict)):
        print(f"  {k}: [{type(v).__name__} com {len(v)} itens]")
    else:
        print(f"  {k}: {v}")
