-- migration_v18_quota_overrides.sql
-- Override de limites POR USUÁRIO (admin) — permite, por ex., deixar a busca de
-- leads ILIMITADA (-1) pra um usuário específico, independente do plano.
--
-- Contexto: os limites vêm de plans.PLAN_LIMITS (por plan_id). O painel admin
-- tinha campos de limite, mas o backend os IGNORAVA. Estas colunas passam a ser
-- o override: quando != NULL, vencem o limite do plano (só quando a subscription
-- está ativa — suspensa/expirada continua zerando tudo). NULL = usa o plano.
--
-- Rode no Supabase (SQL Editor). Idempotente.

BEGIN;

ALTER TABLE public.user_quotas
    ADD COLUMN IF NOT EXISTS leads_limit_override     integer,
    ADD COLUMN IF NOT EXISTS campaigns_limit_override integer,
    ADD COLUMN IF NOT EXISTS messages_limit_override  integer;

COMMENT ON COLUMN public.user_quotas.leads_limit_override     IS 'Override por usuário do limite de leads/mês. NULL = usa PLAN_LIMITS. -1 = ilimitado.';
COMMENT ON COLUMN public.user_quotas.campaigns_limit_override IS 'Override por usuário do limite de campanhas. NULL = usa PLAN_LIMITS. -1 = ilimitado.';
COMMENT ON COLUMN public.user_quotas.messages_limit_override  IS 'Override por usuário do limite de mensagens. NULL = usa PLAN_LIMITS. -1 = ilimitado.';

COMMIT;
