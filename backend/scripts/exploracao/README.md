# Scripts de exploração

Scripts ad-hoc que rodamos durante o planejamento do PR 4 do refactor de
email enrichment pra **validar suposições contra dados reais**. Justificam
decisões registradas em `docs/ADR-001-fontes-de-dados.md`.

Não são parte do pipeline de produção. Rode manualmente com `python <arquivo>`.

## Arquivos

### `debug_brasilapi.py`
Dump completo do payload BrasilAPI pra Magazine Luiza. Como descobrimos
quais campos a API devolve (e quais NÃO devolve — notavelmente `email`).

### `compara_fontes.py`
Compara 4 fontes de dados de CNPJ (BrasilAPI, ReceitaWS, CNPJ.ws,
MinhaReceita) pra UM CNPJ. Mostra rapidamente quem tem email, quem não tem,
e qual o shape da resposta.

### `teste_receitaws.py`
Roda ReceitaWS contra 8 empresas brasileiras grandes (Magazine Luiza,
Natura, Petrobras, etc.) com sleep de 22s entre chamadas pra respeitar
rate limit grátis. **Esse é o script que comprovou que ReceitaWS às vezes
TEM email** (ex: Magazine Luiza devolveu `fiscal.estadual@magazineluiza.com.br`)
mas que o rate limit inviabiliza pro nosso volume.

## Por que versionar

> "Eles documentam como descobrimos a limitação da Receita, vale versionar."

Decisões grandes (LGPD bloqueia email-via-CNPJ, ReceitaWS rate-limited,
Firecrawl como custo fixo) ficaram registradas no ADR-001. Estes scripts
são a **evidência reproduzível** das decisões. Se alguém futuramente
questionar "será que BrasilAPI agora retorna email?", basta rodar
`python debug_brasilapi.py` pra checar.
