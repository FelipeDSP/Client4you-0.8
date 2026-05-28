# ADR-002 — Fonte de descoberta de leads (DataForSEO vs Serper)

**Status:** Aceita
**Data:** 2026-05-28
**Decisores:** edicao@estudyou.com + Claude
**Substitui parcialmente:** [`ADR-001` D5](ADR-001-fontes-de-dados.md) (que previa migração pra Serper pós-PR 6)
**Anula:** PR 7 do refactor de email enrichment (abstração `LeadDiscoveryProvider` + `SerperDiscoveryProvider`)

## Contexto

Pós-refactor de email enrichment (PRs 1-6), a próxima etapa planejada era abstrair
a fonte de descoberta de leads (hoje DataForSEO) atrás de uma interface e plugar
o Serper como alternativa. Motivação registrada no `ADR-001` D5: Serper tem
mesmo modelo PAYG, mais barato por lead, e nossa conta DataForSEO está travada
por verificação que não aceita números BR.

Antes de codar o PR 7, validamos o Serper na doc oficial pra evitar o vício de
"mock otimista" que quase nos queimou na validação da BrasilAPI (ver `ADR-001` D1).
A validação mudou a análise.

## Análise comparativa

### DataForSEO (atual)

- **Modelo:** PAYG, ~$2/1K resultados
- **Volume por chamada:** `MAX_DEPTH = 700` (`backend/dataforseo_service.py:31`).
  Uma única request retorna até 700 leads.
- **Status da conta:** travada por verificação que não aceita números BR. Sandbox
  exige credenciais válidas da conta principal, então também está bloqueado.
- **Caminhos pra destravar:**
  - Ticket de suporte DataForSEO
  - Depósito mínimo de $50 ao ir pra produção (ver `TECH_DEBT.md#4`)

### Serper (avaliado)

- **Modelo:** PAYG, $1/1K queries (cai a $0.30/1K em escala). Mais barato por
  consulta que DataForSEO.
- **Endpoint:** `POST https://google.serper.dev/maps`, header `X-API-KEY`.
- **Cobrança real:** **3 créditos por query**, não por resultado. Cap de
  `num=20` por query. Para 200 leads = 10 queries paginadas = 30 créditos.
- **Paginação:** suporta `page=1,2,3,...` no `/maps` (similar ao `/search`),
  mas é paginação cliente — N queries separadas, 1 chamada HTTP cada.
- **Onboarding:** 2500 créditos grátis válidos 6 meses, sem fricção de verificação BR.
- **Limitação documentada por concorrentes:** acima de ~100 resultados paginados,
  Google retorna duplicados/irrelevantes (mesmo problema que o web Maps tem).
  Fonte: comparativo Scrap.io vs Serper.dev.
- **Response shape (confirmado):**
  `{places: [{cid, title, address, phoneNumber, website, rating, ratingCount, type, latitude, longitude}]}`

## Decisão

**Manter DataForSEO como fonte única de descoberta. Não implementar a abstração
`LeadDiscoveryProvider` agora. Não codar `SerperDiscoveryProvider`. PR 7
cancelado.**

## Justificativa

1. **Volume nativo do DataForSEO resolve nosso padrão de uso.** `depth=700`
   numa única request HTTP elimina a complexidade de paginação cliente. Nosso
   produto oferece buscas grandes (basico=500/mês, intermediario=2000/mês) —
   buscas de 100+ leads serão comuns.

2. **Paginação manual do Serper é fricção desnecessária pro nosso caso.** 10
   queries pra atingir 200 leads significa:
   - 10x mais chamadas HTTP (latência cumulativa)
   - 10x mais pontos de falha (retry logic mais complexa)
   - Necessidade de dedup cliente entre páginas (Serper não garante)
   - Degradação documentada acima de ~100 resultados (duplicados/irrelevantes)

3. **A vantagem de custo do Serper some pra batches grandes.** 200 leads
   no DataForSEO = 2 páginas de 100 = $0.40. Serper = 10 queries × 3 créditos =
   30 créditos ≈ $0.03 em escala. Economia real, mas em valor absoluto pequeno
   comparado ao custo do plano cliente (~R$ 99,90/mês intermediário).

4. **O problema da conta DataForSEO é resolvível.** Verificação BR pode ser
   destravada via ticket de suporte ou depósito mínimo de $50 ao ir pra
   produção. NÃO é blocker arquitetural, é blocker operacional. Não justifica
   refactor de arquitetura.

5. **Princípio de menor coisa que funciona.** O DataForSEO está integrado e
   produzindo. Trocar fornecedor por economia marginal viola o princípio de
   PRs pequenos/revisáveis ([`feedback-small-prs`]). Reabrir só se o custo
   ficar prejudicial ou o DataForSEO mudar preço/quebrar.

## Consequências

### Positivas

- Zero código novo, zero risco de regressão. PR 7 sai do roadmap.
- DataForSEO continua sendo o canônico — testes existentes
  (`test_dataforseo_service.py`) permanecem como suite primária.
- A pendência da conta DataForSEO (verificação BR) vira blocker operacional
  pra ir pra produção, com 2 caminhos claros (ticket OU depósito $50).

### Negativas / aceitas

- Continuamos dependentes de UMA fonte. Se DataForSEO subir preço ou descontinuar
  a Maps Live Advanced API, perdemos a descoberta toda. Mitigação: monitor de
  custo/uptime; reabrir esse ADR se algum gatilho disparar.
- Perdemos a opcionalidade de comparar qualidade real DataForSEO vs Serper
  com nossos 194 leads atuais. Aceitamos esse trade-off em troca de não
  carregar complexidade de abstração ociosa.
- Os 2500 créditos grátis do Serper ficam sem uso. Sem prejuízo financeiro
  (são grátis), mas custo de oportunidade simbólico.

## Quando reabrir

Reavaliar quando:

- DataForSEO travar de vez (suporte não responde, conta suspensa permanentemente)
- DataForSEO mudar precificação pra um patamar que afete margem por plano
- Volume médio por busca cair abaixo de 50 leads (paginação do Serper fica viável)
- Surgir necessidade de comparar qualidade entre fontes (ex: clientes
  reclamando de cobertura)

Quando reabrir: este ADR deve ser anotado como SUPERADO, e um ADR-003 deve
documentar o gatilho e a nova decisão.

## Referências

- `backend/dataforseo_service.py` — integração atual
- `docs/TECH_DEBT.md#4` — conta DataForSEO travada (blocker operacional)
- `docs/TECH_DEBT.md#5` — abstração avaliada e ADIADA (entry atualizada)
- `docs/ADR-001-fontes-de-dados.md` D5 — premissa anterior (Serper era plan A)
- Plano original PR 7: `plano-pr7-serper.md` (fora do repo)
