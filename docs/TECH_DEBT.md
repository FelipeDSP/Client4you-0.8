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

Tanto `email_worker.py` quanto `enrichment_worker.py` (a partir do PR 5 do
refactor de enrichment) rodam single-process via `BackgroundTasks` da
FastAPI. Se o uvicorn reiniciar no meio, o job para — confiamos em
`status='pending'` persistido no banco pra retomar quando o caller chamar
de novo.

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
