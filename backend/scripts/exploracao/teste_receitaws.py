import httpx, json, time

cnpjs = {
    "Magazine Luiza": "47960950000121",
    "Natura":         "71673990000177",
    "Localiza":       "16670085000155",
    "Hering":         "78876950000171",
    "Petrobras":      "33000167000101",
    "Lojas Renner":   "92754738000162",
    "Raia Drogasil":  "61585865000151",
    "Arezzo":         "16590234000176",
}

def busca_email_recursivo(obj):
    """acha qualquer valor com @ no json aninhado"""
    achados = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str) and "@" in v and "." in v:
                achados.append(f"{k}={v}")
            else:
                achados += busca_email_recursivo(v)
    elif isinstance(obj, list):
        for item in obj:
            achados += busca_email_recursivo(item)
    return achados

print("Testando ReceitaWS (rate limit ~3/min, vai demorar)...\n")
print(f"{'EMPRESA':<18} {'STATUS':<10} EMAIL")
print("-"*70)

com_email = 0
ok = 0
for nome, cnpj in cnpjs.items():
    try:
        r = httpx.get(f"https://receitaws.com.br/v1/cnpj/{cnpj}", timeout=20)
        if r.status_code == 200:
            d = r.json()
            if d.get("status") == "ERROR":
                print(f"{nome:<18} {'LIMITE':<10} {d.get('message','')[:40]}")
            else:
                ok += 1
                emails = busca_email_recursivo(d)
                if emails:
                    com_email += 1
                    print(f"{nome:<18} {'OK':<10} {'; '.join(emails)[:45]}")
                else:
                    print(f"{nome:<18} {'OK':<10} —")
        else:
            print(f"{nome:<18} HTTP {r.status_code}")
    except Exception as e:
        print(f"{nome:<18} ERRO {type(e).__name__}")
    time.sleep(22)  # ~3 req/min pra nao tomar 429

print("-"*70)
if ok:
    print(f"\nCom email: {com_email}/{ok} = {100*com_email/ok:.0f}% cobertura (ReceitaWS)")
