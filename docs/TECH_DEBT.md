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

## 6. Quota de email enrichment ainda não bloqueia

A migration v10 (PR 4) adicionou `user_quotas.emails_enriched_used`,
`firecrawl_credits_spent_estimated`, `cache_hits_count`. O orchestrator
incrementa os 3 atomicamente após cada enrichment, mas **NÃO bloqueia o
usuário** por agora — não há limite por plano configurado.

**Por que adiar o bloqueio:**

- O endpoint atual é síncrono e o frontend não trata `402` específico de
  quota de enrichment. Bloquear no PR 4 quebra UX silenciosamente.
- O front recebe campos novos (`source`, `confidence`, `cached`) aditivos,
  mas a UI de "Reenriquecer" / sub-quota separada só entra no PR 6.

**Resolução proposta (PR 6):**

- Mapear limites por plano no backend (ex: demo=10, básico=100, intermediário=500).
- Validar `emails_enriched_used >= limite` no início do endpoint e retornar
  `402` com mensagem específica.
- Sub-quota separada (~10/mês) pro botão "Reenriquecer" do plano intermediário+
  forçar bypass do cache (cliente quer dado fresco).
- Frontend trata `402` com toast + modal de upgrade.

**Hoje a telemetria já está armazenada** — quando o PR 6 ligar o gate,
usuários que estão consumindo MUITO já têm o histórico no `user_quotas`
pra avaliar planos.

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
