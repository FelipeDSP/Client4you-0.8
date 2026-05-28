import httpx, json

cnpj = "47960950000121"  # Magazine Luiza

fontes = {
    "BrasilAPI":  f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}",
    "ReceitaWS":  f"https://receitaws.com.br/v1/cnpj/{cnpj}",
    "CNPJ.ws":    f"https://publica.cnpj.ws/cnpj/{cnpj}",
    "MinhaReceita": f"https://minhareceita.org/{cnpj}",
}

for nome, url in fontes.items():
    try:
        r = httpx.get(url, timeout=20, follow_redirects=True)
        print(f"\n=== {nome} === HTTP {r.status_code}")
        if r.status_code == 200:
            d = r.json()
            # procura email em qualquer lugar do json
            txt = json.dumps(d).lower()
            email_keys = [k for k in str(d) if False]  # placeholder
            # busca direta
            email = d.get("email") or d.get("correio_eletronico")
            print(f"  email (campo direto): {email}")
            if "@" in txt:
                print(f"  >>> CONTEM '@' em algum lugar do payload!")
            else:
                print(f"  (nenhum '@' no payload inteiro)")
        else:
            print(f"  body: {r.text[:150]}")
    except Exception as e:
        print(f"\n=== {nome} === ERRO {type(e).__name__}: {e}")
