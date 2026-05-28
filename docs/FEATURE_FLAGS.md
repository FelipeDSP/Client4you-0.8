# Feature Flags — Client4you

Flags de runtime/build pra ligar/desligar módulos sem deletar código nem mexer
no banco. **Padrão = default off.** Pra ativar, set 2 envs e redeploy.

---

## `ENABLE_CAMPAIGNS` — Módulo de Campanhas de Email

Kill-switch reversível pro módulo de campanhas (campaigns + accounts SMTP +
tracking pixel + dashboard widgets de campanha + tab de SMTP em Settings).

### Estado atual

**OFF** (default). Definido em `docs/COOLIFY_ENV_VARS.md`:

```bash
ENABLE_CAMPAIGNS=false           # backend
VITE_ENABLE_CAMPAIGNS=false      # frontend
```

### O que acontece quando OFF

| Camada | Comportamento |
|---|---|
| **Backend** | `/api/email-accounts`, `/api/email-campaigns`, `/api/email-tracking` **não registrados** (404). Imports condicionais dentro de `if ENABLE_CAMPAIGNS:` em `server.py` — `email_worker.py` e `email_service.py` nem são carregados. Worker `process_campaign` **nunca dispara**. |
| **Frontend menu** | Item "Campanhas de Email" **some** do sidebar (filtrado em `AppSidebar.featureItems`). |
| **Rota direta** | Acesso a `/email-campaigns` por URL → **redirect pra `/dashboard`** (sem 404 nem página em branco). |
| **Dashboard** | 3 cards de campanha (Campanhas, Emails Enviados, Enviados Hoje) **escondidos**; só "Total de Leads" aparece. Grid colapsa pra 1 coluna. |
| **Settings** | Tab "Email (SMTP)" **escondida**; defaultValue cai pra "Integrações"; grid colapsa pra 1 coluna. `useEmailAccounts.useQuery` tem `enabled: ENABLE_CAMPAIGNS` → zero requests inúteis. |
| **Banco** | **Intacto.** Tabelas `email_campaigns`, `email_campaign_recipients`, `email_accounts`, `email_events` e dados permanecem como estão. Zero migration. |
| **Arquivos** | **Todos preservados.** `pages/EmailCampaigns.tsx`, `hooks/useEmailCampaigns.tsx`, `hooks/useEmailAccounts.tsx`, `routes/email_*.py`, `email_worker.py` — código no repo, só sem ponto de entrada quando off. |

### Como REATIVAR

1. **Backend** (env var no Coolify ou `.env`):
   ```bash
   ENABLE_CAMPAIGNS=true
   ```
   Reinicia o container — server.py carrega imports e registra as 3 rotas.

2. **Frontend** (env var Vite — resolvido no BUILD, não runtime):
   ```bash
   VITE_ENABLE_CAMPAIGNS=true
   ```
   **REBUILD e redeploy.** Mudar a env sem rebuild não vai pegar.

3. Verificar:
   - `curl https://seu-backend/api/email-campaigns` retorna 401 (não 404)
   - Menu sidebar mostra "Campanhas de Email"
   - Dashboard mostra os 4 cards
   - Settings mostra as 2 tabs

### ⚠️ IMPORTANTE: manter os DOIS lados em sync

- Backend ON + Frontend OFF: usuários veem o produto sem campanhas (endpoints
  ativos mas sem ponto de entrada). Inofensivo, mas paga compute do worker
  carregado em memória sem uso.
- Backend OFF + Frontend ON: UI vai chamar endpoints que retornam 404 →
  toasts de erro pro usuário, UX quebrada. **Não fazer.**

Regra: mudar os dois juntos no deploy.

### Por que não deletar?

A empresa decidiu focar em busca/enriquecimento de leads. Campanhas podem
voltar. Custo de manter o código:

- ~2k LOC dormente (3 rotas + 3 hooks + 1 página + 1 worker)
- Imports lazy no frontend → bundle size mínimo
- Imports condicionais no backend → 0 carga em memória quando off

Custo de deletar:

- Risco de perder lógica de tracking que demorou a estabilizar
- Perda de testes existentes (se houver)
- Re-trabalho se reativar

Trade-off: **manter** é mais barato que **deletar+reescrever** se houver dúvida.

### Quando deletar de verdade

Quando passar de N meses (definir prazo) sem nenhum cliente pedir campanhas
E não houver intenção comercial de retomar. Aí faz um PR de "remoção
definitiva" que:

1. Deleta os arquivos
2. Decide se mantém tabelas no banco (histórico) ou faz migration de drop
3. Remove a flag deste documento
