# Migrations — Client4you

Scripts SQL aplicados **manualmente** no Supabase (SQL Editor). Não há ferramenta
de migração automática (nenhuma tabela `schema_migrations`) — a fonte de verdade
do schema é a combinação destes arquivos aplicados na ordem abaixo.

## ⚠️ Aviso importante: NÃO é possível criar o banco do zero só com estes arquivos

As tabelas-**núcleo** (`companies`, `profiles`, `leads`, `subscriptions`,
`user_quotas`, `company_settings`, `audit_log`, ...) **não são criadas em nenhum
arquivo aqui**. Elas foram criadas pela UI do Lovable/Supabase antes de as
migrations passarem a ser versionadas. Só 3 arquivos têm `CREATE TABLE`, e apenas
para tabelas **novas** (`email_campaigns`, `email_accounts`, `enrichment_jobs`,
`domain_email_cache`, ...).

Ou seja: estes scripts são **patches incrementais** sobre uma base que vive só no
banco vivo. Rodar tudo num banco vazio **falha** (ex.: `ALTER TABLE leads ...`
numa tabela que ainda não existe).

**Para ter um `schema.sql` de verdade (from scratch)**, exporte o schema do banco:

```bash
# via CLI do Postgres (troque a connection string pela do seu projeto):
pg_dump --schema-only --no-owner --no-privileges "postgresql://..." > docs/migrations/schema_baseline.sql
```

ou no Supabase Dashboard → Database → Schema Visualizer / backup. Ver também o
item de baseline em `../TECH_DEBT.md`.

## Ordem de aplicação (cronológica)

A base (Lovable) já existe. Sobre ela, aplique nesta ordem:

| # | Arquivo | O que faz |
|---|---|---|
| 1 | `migration_clean_v1.sql` | Reset cirúrgico: ENUMs, RLS por tabela, consolidação de `agent_*`, `subscriptions` como fonte do plano. **(Monolítico.)** |
| — | `migration_clean_v1_part1..5_*.sql` | **Mesma coisa do v1, fatiada em 5 partes** (forma alternativa de aplicar, mais leve por passo). Use OU o monolítico OU as 5 partes — não os dois. |
| 2 | `migration_clean_v2_remove_agente.sql` | Remove o feature Agente IA (`agent_configs`) e o plano `avancado`. |
| 3 | `migration_clean_v3_remove_whatsapp.sql` | Remove WhatsApp/Disparador (campaigns, message_logs, colunas WAHA). |
| 4 | `migration_v4_email_campaigns.sql` | Tabelas de campanhas de **e-mail** (feature novo, distinto do WhatsApp). |
| 5 | `migration_v5_admin_view.sql` | View de admin. |
| 6 | `migration_v6_saved_leads.sql` | `saved_at` em leads (Base de Leads vs busca transitória). |
| 7 | `migration_dataforseo.sql` | Ajustes para a descoberta via DataForSEO. |
| 8 | `migration_v7_contact_url.sql` | `contact_url` em leads. |
| 9 | `migration_v8_cnpj.sql` | `cnpj` em leads. |
| 10 | `migration_v9_domain_email_cache.sql` | Cache global de e-mail por domínio. |
| 11 | `migration_v10_enrichment_metadata.sql` | Metadados de enriquecimento. |
| 12 | `migration_v11_leads_receita_metadata.sql` | Metadados da Receita Federal (CNPJ). |
| 13 | `migration_v12_enrichment_jobs.sql` | Fila assíncrona de enriquecimento. |
| 14 | `migration_v13_reenrich_quota.sql` | Sub-quota de reenriquecimento. |
| 15 | `migration_v14_quota_atomic.sql` | RPC `increment_quota_atomic` (incremento atômico de quota). |
| 16 | `migration_v15_leads_latlng.sql` | Colunas `latitude`/`longitude` em leads (mini-mapa por lead). |

## Scripts operacionais (não são schema de tabela)

- `supabase_cron_jobs.sql` — jobs `pg_cron` da era WhatsApp (limpeza de
  `message_logs`). **Provavelmente obsoleto** — o `clean_v3` desagenda esses jobs
  e dropa as tabelas. Revisar antes de reaplicar.
- `supabase_optimization.sql` — views e índices de performance (ex.:
  `company_member_counts`). Parte pode referenciar tabelas já removidas — revisar.
- `migration_settings_expansion.sql` — campos de Disparador/Remarketing em
  `company_settings`. **Obsoleto**: o `clean_v3` remove essas colunas.
