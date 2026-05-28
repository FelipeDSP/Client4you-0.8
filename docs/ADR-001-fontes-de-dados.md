# ADR-001 — Fontes de dados pra enrichment de leads

**Status:** Aceita
**Data:** 2026-05-28 (decidida durante o PR 4 do refactor de email enrichment)
**Decisores:** edicao@estudyou.com + Claude

## Contexto

Durante o planejamento do PR 4 (orchestrator de email enrichment), validamos
fontes de dados contra empresas brasileiras REAIS — não mocks. Os resultados
quebraram o plano original e exigiram revisão.

### Validações realizadas

1. **BrasilAPI `/api/cnpj/v1/{cnpj}` retorna `email=None` em ~100% dos casos.**
   Testado contra 12 empresas reais (Magazine Luiza, Natura, Petrobras, etc.) —
   todas com `email: None`. A API mascara email, provavelmente por LGPD.

2. **ReceitaWS às vezes tem email** (ex: Magazine Luiza devolveu
   `fiscal.estadual@magazineluiza.com.br`). MAS o rate limit grátis é ~3 req/min,
   inviável pro nosso volume (100 leads = ~33min serial). Versão paga
   reintroduz custo com cobertura de email incerta.

3. **Firecrawl NÃO é pay-as-you-go.** É assinatura mensal fixa
   ($16 Hobby / $83 Standard). Créditos não rolam, não há cache embutido,
   e re-scrapes da mesma URL são cobrados de novo.

## Decisões

### D1 — Email-via-CNPJ é inviável no Brasil pós-LGPD

Não há fonte oficial e gratuita que devolva email de CNPJ ativo com cobertura
útil. Decisão: **abandonar o caminho "email via Receita".**

### D2 — BrasilAPI vira metadata enrichment (não email)

Apesar de não ter email, BrasilAPI devolve campos de altíssimo valor pra
qualificação: `razao_social`, `nome_fantasia`, `cnae_fiscal_descricao`,
`porte`, `descricao_situacao_cadastral`, `qsa` (sócios), `ddd_telefone_1`.

**Implementação:** `ReceitaFederalProvider` (PR 3) foi rebaixado e movido
de `services/email_providers/` pra `services/metadata_enrichment/` como
`ReceitaFederalMetadataProvider`. Interface nova:
`enrich(lead) -> MetadataResult` (não `find_email`). Floor de confiança
0.6 removido (não tem mais sentido — não tem email).

### D3 — Firecrawl como custo fixo de infra (não PAYG)

Aceitar Firecrawl como **custo fixo de infraestrutura**, amortizado entre
todos os clientes. Pra proteger margem:

- **Cache global por DOMÍNIO** (`domain_email_cache`, migration v9) — 200
  leads do McDonald's (de 50 clientes diferentes) compartilham 1 scrape de
  `mcdonalds.com.br`.
- **Cache negativo conta**: se rodou e não achou, guarda `email=NULL` —
  evita re-scrapar todo mês um domínio que não tem email.
- **TTL 30d** (configurável por `EMAIL_CACHE_TTL_DAYS`).
- **Quota por LEAD, não por scrape**: "seu plano dá X enriquecimentos/mês"
  é vendável; "X créditos Firecrawl variáveis" não é. Telemetria interna
  (`firecrawl_credits_spent_estimated`, `cache_hits_count`) mede ROI do cache.

### D4 — Cascata de email final (PR 4)

1. **DataForSEOContactUrl** (se lead tem `contact_url`, custo $0) — scrape
   direto da URL de contato cadastrada no GMB.
2. **FirecrawlSearch** (1 call `/v1/search` com `site:dominio`) — mais
   eficiente em crédito que o map+scrape.
3. **FirecrawlMapScrape** (fallback: `/v1/map` + `/v1/scrape` seletivo) —
   mais caro, último recurso.

Early-stop quando `confidence >= 0.8`. Cache lookup ANTES da cascata.

### D5 — Descoberta migrará pra Serper (pós-PR 6)

DataForSEO (descoberta de leads via Google Maps) continua funcionando, mas
nossa conta está travada por phone verification (não aceita BR). Serper é
candidato a substituto: mesmo modelo PAYG, 2500 buscas grátis, menos
atrito de onboarding.

**Quando:** PR separado pós-PR 6 do refactor de email enrichment.
**Como:** abstração `LeadDiscoveryProvider` (espelho do padrão
`EmailProvider`) + `SerperDiscoveryProvider` plugável. Registrado em
`TECH_DEBT.md#5`.

## Consequências

### Positivas

- Email enrichment vira previsível em custo (cache hit ≈ 70%+ esperado em
  steady state).
- Metadata enrichment (Receita) é grátis e útil pra qualificação —
  passa a ser pipeline independente.
- Quota por lead alinha incentivos: cliente paga pela tentativa, otimização
  de cache vira margem nossa.

### Negativas / aceitas

- Firecrawl como custo fixo significa que o break-even depende de N clientes
  ativos pra diluir os $16-83/mês. Em <10 clientes, custo por lead alto.
- ReceitaWS (que TEM email às vezes) foi descartado — perdemos uma fonte
  potencial mas o rate limit não viabiliza.
- Cache global expõe domínios (não dados) — mitigado por RLS estrita
  (apenas service_role).

## Referências

- Migrations: `migration_v9_domain_email_cache.sql`,
  `migration_v10_enrichment_metadata.sql`
- Código: `backend/services/email_enrichment/`,
  `backend/services/metadata_enrichment/`
- Dívidas relacionadas: `docs/TECH_DEBT.md` itens 4 (DataForSEO travada) e 5 (Serper)
