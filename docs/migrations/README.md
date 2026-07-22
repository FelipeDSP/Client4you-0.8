# Migrations — Client4you

Scripts SQL aplicados **manualmente** no Supabase (SQL Editor). Não há ferramenta
de migração automática (nenhuma tabela `schema_migrations`) — a fonte de verdade
do schema é a combinação destes arquivos aplicados na ordem abaixo.

## 🚀 Setup do zero → use `schema.sql`

Para criar o banco **do zero** num projeto Supabase novo, rode **[`schema.sql`](schema.sql)**
(SQL Editor → cole → Run). Ele é a **baseline consolidada**: extensões, ENUMs,
todas as tabelas na ordem de FK, índices, funções/RPCs e RLS — tudo num arquivo.

Foi montado combinando o **schema real das tabelas** (export do banco vivo) com os
**ENUMs/RLS/funções/índices** destas migrations. Leia o cabeçalho do `schema.sql`:
tem um bloco "⚠️ REVISAR" com os poucos pontos inferidos (ex.: valores do enum
`app_role`, que não está em nenhuma migration). Para fidelidade 100% (grants
finos, triggers de auth), um `pg_dump --schema-only` ainda é o padrão-ouro.

> **Por que não dá pra montar isso só com as migrations abaixo?** As tabelas-núcleo
> (`companies`, `profiles`, `leads`, ...) **não são criadas em nenhuma migration** —
> vieram da base criada pela UI do Lovable. As migrations são **patches
> incrementais** (`ALTER TABLE ...`); rodar elas num banco vazio falha. Por isso o
> `schema.sql` foi consolidado a partir do banco vivo. Ver `../TECH_DEBT.md`.

## Histórico incremental (ordem cronológica)

As migrations abaixo são o **registro histórico** dos patches aplicados sobre a
base do Lovable (não use pra setup novo — use o `schema.sql`). Ordem:

| # | Arquivo | O que faz |
|---|---|---|
| 1 | `migration_clean_v1.sql` | Reset cirúrgico: ENUMs, RLS por tabela, consolidação de `agent_*`, `subscriptions` como fonte do plano. |
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
| 17 | `migration_v16_segments_tags.sql` | Segmentos (pastas) + etiquetas (tags) da Base de Leads: `lead_segments`, `tags`, junções N:N (`lead_segment_members`, `lead_tags`, `segment_tags`) + RLS company-scoped. |

## Limpeza (2026-07-21)

Removidos por obsolescência (o `schema.sql` já cobre o estado atual):
`migration_clean_v1_part1..5` (duplicatas do monolítico), `settings_expansion`
(colunas removidas pelo clean_v3), `supabase_cron_jobs` (limpava `message_logs`,
tabela dropada) e `supabase_optimization` (usava tabelas dropadas — só a view
`company_member_counts`, ainda usada pelo admin, foi preservada no `schema.sql`).
