-- =============================================================================
-- migration_clean_v2_remove_agente.sql — Remoção do feature Agente IA
-- =============================================================================
-- Esta migration:
--   1. Dropa a tabela `agent_configs` em cascade (FKs, indexes e policies caem
--      junto). As helper functions de RLS (user_company_id, is_super_admin,
--      is_company_owner) e as outras tabelas/policies permanecem intactas.
--   2. Faz downgrade de quem estiver no plano 'avancado' para 'intermediario'
--      (com 0 usuários ativos isso provavelmente é no-op, mas é defensivo).
--   3. Recria o enum `plan_id_enum` SEM o valor 'avancado'. PostgreSQL não
--      tem `ALTER TYPE ... DROP VALUE`, então o jeito é criar um enum novo,
--      converter a coluna, dropar o velho e renomear.
--
-- COMO APLICAR:
--   Cole tudo no SQL Editor do Supabase e dê Run. Está em uma transação:
--   se algo falhar, nada é aplicado.
-- =============================================================================

BEGIN;

-- ─── 1) Drop tabela do agente IA ───────────────────────────────────────────
-- CASCADE remove FKs, indexes e RLS policies vinculados.
DROP TABLE IF EXISTS public.agent_configs CASCADE;


-- ─── 2) Downgrade de subscriptions em 'avancado' → 'intermediario' ─────────
UPDATE public.subscriptions
SET plan_id = 'intermediario'::plan_id_enum,
    updated_at = NOW()
WHERE plan_id::text = 'avancado';


-- ─── 3) Recriar enum sem 'avancado' ────────────────────────────────────────
-- 3.1 — cria enum novo
CREATE TYPE plan_id_enum_new AS ENUM ('demo', 'basico', 'intermediario');

-- 3.2 — drop default temporariamente (default usa o tipo antigo)
ALTER TABLE public.subscriptions ALTER COLUMN plan_id DROP DEFAULT;

-- 3.3 — converte coluna para o novo enum (via cast por texto)
ALTER TABLE public.subscriptions
    ALTER COLUMN plan_id TYPE plan_id_enum_new
    USING plan_id::text::plan_id_enum_new;

-- 3.4 — drop enum antigo
DROP TYPE plan_id_enum;

-- 3.5 — renomeia o novo para o nome original
ALTER TYPE plan_id_enum_new RENAME TO plan_id_enum;

-- 3.6 — restaura default
ALTER TABLE public.subscriptions ALTER COLUMN plan_id SET DEFAULT 'demo';


-- ─── 4) Validação final ────────────────────────────────────────────────────
DO $$
DECLARE
    has_avancado_subs INT;
    agent_configs_count INT;
    enum_values text[];
BEGIN
    -- Nenhuma subscription com plan_id='avancado' (impossível agora, mas valida)
    SELECT COUNT(*) INTO has_avancado_subs
    FROM public.subscriptions WHERE plan_id::text = 'avancado';

    -- Tabela agent_configs não existe mais
    SELECT COUNT(*) INTO agent_configs_count
    FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_configs';

    -- Valores do enum
    SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO enum_values
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'plan_id_enum';

    RAISE NOTICE 'subscriptions com plan_id=avancado: % | agent_configs existe: % | plan_id_enum valores: %',
        has_avancado_subs, agent_configs_count, enum_values;

    IF has_avancado_subs > 0 OR agent_configs_count > 0 THEN
        RAISE WARNING 'Migration v2 não terminou limpa — revise manualmente.';
    END IF;
END$$;

COMMIT;
