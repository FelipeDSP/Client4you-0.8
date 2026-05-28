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

## 5. Avaliar migração DataForSEO → Serper pra descoberta de leads

A fonte de descoberta hoje é DataForSEO (Google Maps Live Advanced). A conta
está travada por phone verification (ver item 4), e Serper é candidato a
substituto com **mesmo modelo PAYG, 2500 buscas grátis e menos atrito de
onboarding**.

**Por que NÃO migrar agora:**
- DataForSEO continua funcionando em produção — só o ambiente de teste local
  está sem créditos. Não é blocker.
- Misturar refactor de descoberta com o refactor de email enrichment em
  andamento (PRs 1-6) violaria o princípio de PRs pequenos e revisáveis.

**Resolução proposta:**
- Criar `backend/services/discovery_providers/` com interface
  `LeadDiscoveryProvider` (ABC) — espelho do padrão de `EmailProvider`.
- Adaptar `backend/dataforseo_service.py` pra implementar essa interface
  (`DataForSEODiscoveryProvider`).
- Criar `SerperDiscoveryProvider` plugando atrás da mesma interface.
- Toggle via env: `LEAD_DISCOVERY_PROVIDER=dataforseo|serper` (default
  `dataforseo` no primeiro deploy, virar `serper` quando validado).

**Quando:** PR separado **após** o PR 6 do refactor de email enrichment
(numerar como PR 7). Não inserir no meio da sequência atual.

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
