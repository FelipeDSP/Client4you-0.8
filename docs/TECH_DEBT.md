# Dívida Técnica — Client4you

Issues conhecidas que não bloqueiam funcionalidade atual mas devem ser
endereçadas quando volume/prioridade justificar. Atualize este arquivo
sempre que tomar uma decisão consciente de "não vou consertar agora".

---

## 1. `leads` sem migration versionada de baseline

A tabela `public.leads` foi criada via UI do Supabase antes do
`migration_clean_v1.sql` — não existe um arquivo SQL que reproduza a tabela
do zero. Migrations subsequentes (`v3_remove_whatsapp`, `v6_saved_leads`,
`v7_*`) só fazem `ALTER`.

**Impacto:** subir um ambiente novo do zero exige snapshot manual do
Supabase ou rodar as migrations contra um schema "herdado" inexistente.

**Resolução proposta:** criar `docs/migration_v0_baseline_leads.sql` com o
`CREATE TABLE` canônico (extraível de
`frontend/src/integrations/supabase/types.ts`), idempotente com
`IF NOT EXISTS`. Toda nova migration de `leads` deve assumir esse baseline.

---

## 2. Busca paga de CNPJ por razão social

Hoje (após PR 3 do refactor de enrichment) populamos `leads.cnpj`
passivamente:

- **(a)** Regex no scrape do Firecrawl — grátis, mas só captura sites que
  exibem o CNPJ no rodapé/HTML.
- **(b)** Input manual via `POST /leads/{id}/cnpj` — controle do usuário.

Para leads sem CNPJ no site E sem input manual, o `ReceitaFederalProvider`
não dispara — perdemos o canal mais confiável de email no Brasil.

**Quando reavaliar:** após 1-2 meses de produção, medir o % de leads sem
CNPJ extraível. Se for >40%, avaliar serviços pagos (CNPJ.ws, Casa dos
Dados, ReceitaWS) que oferecem busca por razão social. Decidir baseado em
custo por lead enriquecido vs. ganho de conversão.

---

## 3. Workers em-processo (`BackgroundTasks`) — migração futura pra Celery + Redis

Tanto `email_worker.py` quanto `enrichment_worker.py` (PR 5) rodam
single-process via `BackgroundTasks` da FastAPI. Se o uvicorn reiniciar
no meio, o job para — confiamos em `status='pending'` persistido no banco
pra retomar quando o caller chamar de novo (POST /enrich-emails/async com
o mesmo payload cria batch novo; pra retomar batch antigo, precisaria
endpoint POST /enrich-emails/resume/{batch_id} — não implementado).

**Limites conhecidos:**

- Dedup por `set` em memória (`_running_campaigns`, `_running_batches`) —
  fura em multi-worker uvicorn (cada worker tem seu próprio `set`).
- Sem retry exponencial automático em falhas transitórias.
- Sem visibility de fila — observabilidade vem de
  `SELECT count(*) ... WHERE status='pending'` no banco.
- Throttling por job (`asyncio.sleep`) bloqueia o event loop daquele
  worker pra outras tarefas.

### ⛔ DO NOT ADD `--workers` SEM RESOLVER ANTES

`backend/Dockerfile`, `deploy/install.sh` e `deploy/setup-hostinger.sh`
rodam uvicorn **sem** `--workers` — default = 1 processo. Esta é uma
**precondição implícita** dos workers em-processo.

Se alguém futuramente quiser mais throughput e adicionar `--workers 2+`:

- O dedup in-memory **quebra silenciosamente**: dois processos podem
  pegar o mesmo `campaign_id`/`batch_id` ao mesmo tempo.
- Consequência: **double-send em campanhas de email** (cliente recebe
  email duas vezes), **double-charge em Firecrawl** (cada scrape custa
  $0.02-0.03 e ainda passa pelo cache).

Hardening defensivo: `server.py` lê `UVICORN_WORKER_COUNT` no startup e
loga CRITICAL se != 1. Quem subir multi-worker tem que setar essa env e
vai ver o warning nos logs — mas isso é **alerta, não bloqueio**.

A solução correta antes de escalar é migrar pra Celery + Redis (descrito
acima) ou implementar advisory lock no Postgres (`pg_try_advisory_lock`
+ `UPDATE ... RETURNING` atômico via RPC).

**Quando migrar:** quando volume justificar — heurística:
- >1000 enrichments/dia OU >10 campanhas concorrentes, OU
- precisamos rodar 2+ workers uvicorn pra atender carga HTTP, OU
- pedir retry com backoff exponencial vira requisito.

Migração esperada: Celery + Redis (já que o stack é Python; RQ é
alternativa mais leve mas com menos features).

---

## 4. Conta DataForSEO Live ainda não ativada

Conta atual tem $1 de trial mas está bloqueada por phone verification (não
aceita números BR). Durante PR 2 do refactor de enrichment, configuramos
`DATAFORSEO_BASE_URL` pra apontar pra sandbox em dev — mas **a sandbox
também exige credenciais válidas da conta principal**, então testes reais
estão bloqueados até resolver a ativação.

**Impacto:**
- Smoke test (`backend/scripts/smoke_test_dataforseo.py`) só roda quando
  ativarmos. Por enquanto, validação do shape de response veio só da doc
  oficial (`https://docs.dataforseo.com/v3/serp/google/maps/live/advanced/`).
- Frontend já valida que `_normalize_item` propaga `contact_url` via teste
  unitário (`backend/tests/test_dataforseo_service.py`), mas a presença
  real desse campo em produção depende do que cada estabelecimento cadastrou
  no GMB.

**Quando resolver:** quando houver budget pra deposit mínimo de **$50** ou
quando phone verification aceitar BR. Assim que ativarmos, rodar o smoke
test em sandbox primeiro e em produção depois pra confirmar campos.

---

## 5. Abstração `LeadDiscoveryProvider` avaliada e ADIADA

**Status:** ADIADA (2026-05-28). Plano original `plano-pr7-serper.md` cancelado.

DataForSEO atende melhor o volume atual (`MAX_DEPTH = 700` em 1 chamada). Análise
completa em [`ADR-002-fonte-de-descoberta.md`](ADR-002-fonte-de-descoberta.md).
Resumo:

- **Serper avaliado:** PAYG mais barato, mas pagina via `page` em
  `/maps` com cap de 20 por query. Pra 200 leads = 10 queries paginadas. Mais
  HTTP, mais retry logic, e degradação documentada acima de ~100 resultados
  (duplicados/irrelevantes).
- **DataForSEO ganhou pelo volume nativo.** `depth=700` numa única request
  cobre buscas grandes do produto (plano intermediário = 2000 leads/mês) sem
  complexidade de paginação cliente.

**Reabrir só se:**

- DataForSEO travar de vez (conta suspensa permanente, suporte não responde)
- DataForSEO mudar preço pra patamar que afete margem por plano
- Volume médio por busca cair < 50 leads (paginação Serper fica viável)
- Clientes reclamarem de cobertura → necessidade de comparar fontes

Se reabrir, criar ADR-003 documentando o gatilho.

**Atualização (2026-07-20): Serper e Scrappa plugados como fontes de DEV/TESTE.**
**Atualização (2026-07-21): Serper REMOVIDO; Scrappa mantido.**
Para desenvolver sem depender da conta DataForSEO travada, o Scrappa foi
integrado como fonte alternativa, selecionável por `LEAD_SOURCE`
(`backend/scrappa_service.py` + `backend/lead_source.py`). O Serper chegou a ser
plugado mas foi removido em 2026-07-21 (paginação manual não valia a manutenção;
re-alinha com o ADR-002, que já o havia descartado). **Escopo deliberado: Scrappa
é apenas dev/teste** — o default continua `dataforseo` e a decisão de PRODUÇÃO do
[`ADR-002`](ADR-002-fonte-de-descoberta.md) (DataForSEO canônico) **segue
inalterada**. Pontos que continuam dívida:

- **Scrappa** (`LEAD_SOURCE=scrappa`) devolve até **200 results/request**
  (`MAX_DEPTH = 200`) e tem **500 créditos/mês recorrente** — plugado por ser
  melhor pra ambiente de teste durável (validado por chamada real em 2026-07-20:
  `limit=50` retornou 50). Nuance mapeada: categoria vem de `subtypes[0]`, não
  de `type` (que é o termo de busca genérico). Coordenada (`latitude`/`longitude`)
  capturada na migration v15 pro mini-mapa por lead.
- Decisão de fonte **para produção** permanece a do ADR-002. Scrappa tem números
  atraentes (200/request, 1 crédito, tier recorrente) e PODERIA ser candidato de
  produção — mas isso é decisão separada; se for reaberta, documentar em ADR-003.

A pendência operacional do DataForSEO (verificação BR — item 4 abaixo)
continua sendo um blocker de produção, **resolvível** via ticket de suporte
OU depósito mínimo $50.

---

## 6. ✅ RESOLVIDO em PR 6 (2026-05-28)

A migration v10 (PR 4) adicionou os contadores; PR 6 ligou o bloqueio.

- `email_enrichment_limit` e `reenrich_limit` agora vivem em `backend/plans.py`
  por plano: demo=50/0, basico=500/0, intermediario=2000/10.
- `POST /enrich-emails` (síncrono) e `POST /enrich-emails/async` (com
  `force=true` ou false) verificam quota e retornam **402** com payload
  `{reason, action, limit, used, requested}`.
- Frontend (`useLeads.enrichEmailsMutation`) levanta `QuotaExhaustedError`
  com `detail` estruturado; `SearchLeads.tsx` abre toast + `QuotaLimitModal`.
- Migration v13 adicionou `user_quotas.reenrich_used` separado.

**Calibração dos limites:** ver item 9 abaixo (números atuais são chute
conservador, precisa recalibrar com custo Firecrawl real em produção).

---

## 7. ADR-001 referencia cobertura de cache de ~70%+ sem dados reais ainda

O `docs/ADR-001-fontes-de-dados.md` justifica adotar Firecrawl como custo
fixo apoiado na premissa de que cache hit rate vai estabilizar em ≥70% em
steady state (franquias, redes, domínios populares compartilham scrape).

**Esta premissa NÃO foi medida** — é estimativa baseada em distribuição
heurística de leads. Pode ser superotimista pra carteiras de clientes que
buscam empresas únicas (nichos B2B muito segmentados).

**Quando reavaliar:** após 1 mês de produção do PR 4 com volume
significativo (>1000 enrichments). Métrica: `cache_hits_count / emails_enriched_used`.

Se <40%, considerar:
- Pre-warming do cache em background pra domínios de buscas top
- Negociar plano Firecrawl maior antes de subir preço pro cliente
- Self-hosted Firecrawl (já tem repo open-source) — troca cobrança mensal por
  hosting + storage próprio

---

## 8. Endpoints async sem testes de integração via TestClient

PR 5 adicionou `POST /enrich-emails/async` e `GET /enrich-emails/status/{batch_id}`.
O worker (`process_batch`) tem 8 testes que cobrem lógica de processamento, dedup,
multi-tenancy e idempotência. **Os endpoints em si NÃO têm testes de integração**
via FastAPI TestClient — só sanity check de import.

**Por que adiar:** TestClient com auth mock + DB mock exige montar fixtures
complexas (security_utils, get_db, etc.). Worker já cobre a parte com lógica
não-trivial; endpoints são thin wrappers (validação básica + INSERT + dispatch).

**Quando resolver:** quando aparecer regressão em algum dos endpoints, OU
quando o PR 6 do frontend revelar contrato ambíguo. Mais barato adicionar
sob demanda do que escrever especulativamente agora.

**Como resolver:** TestClient + monkeypatch em `get_db` (FakeSupabase do
`test_enrichment_worker.py` já tem o pattern) + override de
`get_authenticated_user` via `app.dependency_overrides`.

---

## 9. Limites de email enrichment são chute conservador

`backend/plans.py` define limites por plano:

| Plano          | `leads_limit` | `email_enrichment_limit` | `reenrich_limit` |
|----------------|---------------|--------------------------|------------------|
| demo           | 50            | 50                       | 0                |
| basico         | 500           | 500                      | 0                |
| intermediario  | 2000          | 2000                     | 10               |

**Por que estes números:** lê-se "todo lead extraído pode ser enriquecido 1x".
Simples de explicar pro cliente, alinhado com unit economics do PR 4
(quota por lead, não por crédito Firecrawl). Reenrich limitado agressivamente
(10/mês) porque força always-miss no cache → sempre gasta Firecrawl.

**Por que pode estar errado:**

- Não temos dados reais de custo Firecrawl em produção ainda. Hit rate
  do cache (premissa de 70%+ do item 7) é estimativa.
- Plano Firecrawl mensal não foi definido — não dá pra calcular margem por
  plano cliente ainda.
- Se hit rate < 50% E intermediario for vendido muito, plano top vira
  prejuízo (2000 leads × $0.025 médio Firecrawl = $50/mês de custo só de
  enrichment vs R$ 99,90 cobrado).

**Quando recalibrar:**

- Após 1 mês com volume produção (>500 enrichments). Métricas:
  - `cache_hits_count / emails_enriched_used` por usuário
  - `firecrawl_credits_spent_estimated` médio por usuário
- Decidir entre: subir preço, baixar limite, ou negociar plano Firecrawl maior.

---

## 10. Inconsistências que exigem decisão de comportamento (NÃO corrigidas na limpeza de 2026-06-09)

A vistoria de inconsistências de 2026-06-09 corrigiu tudo que era seguro (código
morto, docs, defaults, tipos de status, promessa falsa no e-mail, higiene de
config). Os itens abaixo foram **deixados de propósito** porque alteram
comportamento de runtime e precisam de decisão/PR coordenado:

- **`/api/quotas/increment` confia em `action`+`amount` do cliente** (`quotas.py`).
  `amount` negativo reduz o próprio contador. Convive com incremento server-side
  autoritativo no `/search`. Decidir: remover o endpoint, ou clamp `amount>=1` +
  validar `action`. (Também é achado de segurança.)
- **`check_quota` fail-open em exceção** (`supabase_service.py`) e **`ENVIRONMENT`
  default `development`** (`security_utils.py`, auth fail-open). Mudar pra
  fail-closed pode travar dev local — fazer junto com hardening de segurança.
- **Plano `demo`: backend ativo (50 leads) vs `usePlanPermissions` morto**
  (`usePlanPermissions.tsx:80`). Decidir se demo existe; hoje as duas verdades
  coexistem. Idem `leadsLimit:-1` decorativo pra básico/intermediário no mesmo hook.
- **`_map_lead` não retorna campos de enrichment do PR6** (cnpj/source/confidence/
  razao_social) e hardcoda `city`/`state` vazios. Mudança de shape de API → só em
  PR coordenado com o front (regra [[feedback_read_frontend_before_api_change]]).
- **Campo `hasWhatsApp`/`has_whatsapp`** ainda flui no contrato de leads (sempre
  False). Remoção é mudança de shape — adiada pelo mesmo motivo.
- **Curva de plano invertida**: demo (grátis) tem `campaigns_limit:1` e
  `messages_limit:50`; básico (pago) tem `0`/`0` (`plans.py`). Campanhas estão
  desligadas por flag, então não afeta uso hoje — revisar ao reativar campanhas.
- **Dívida de schema**: `webhook_logs`/`user_quotas`/`enrichment_jobs` etc. sem
  `CREATE TABLE` versionado (ver item 1) e `integrations/supabase/types.ts`
  gerado cobrindo só ~7 tabelas. Regenerar os tipos do Supabase resolve o drift
  de tipos do front.
