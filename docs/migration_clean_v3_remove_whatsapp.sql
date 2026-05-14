-- =============================================================================
-- migration_clean_v3_remove_whatsapp.sql — Remoção do feature WhatsApp/Disparador
-- =============================================================================
-- A plataforma está pivotando de "outreach via WhatsApp" para "outreach via
-- email + gestão de leads". Esta migration:
--   1. Dropa as tabelas de campanha (campaigns, campaign_contacts,
--      message_logs, bot_sessions). Tudo cascateia.
--   2. Dropa os ENUMs específicos de campanha.
--   3. Limpa colunas WAHA/remarketing de company_settings (sobra de fases
--      anteriores).
--   4. Dropa coluna `remarketing_sent_at` de leads.
--
-- Mantemos `leads.has_whatsapp` porque é metadado útil de prospecção (saber
-- se o lead tem WhatsApp ajuda a priorizar emails).
--
-- COMO APLICAR:
--   Cole tudo no SQL Editor do Supabase e dê Run. BEGIN/COMMIT protege:
--   se algo falhar, nada é aplicado.
-- =============================================================================

BEGIN;

-- ─── 1) Drop views dependentes ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.dashboard_campaign_stats;


-- ─── 2) Drop tabelas de campanha (CASCADE limpa FKs/indexes/policies) ─────
DROP TABLE IF EXISTS public.message_logs CASCADE;
DROP TABLE IF EXISTS public.campaign_contacts CASCADE;
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.bot_sessions CASCADE;


-- ─── 3) Drop ENUMs específicos de campanha ─────────────────────────────────
DROP TYPE IF EXISTS public.campaign_status_enum;
DROP TYPE IF EXISTS public.message_type_enum;
DROP TYPE IF EXISTS public.contact_status_enum;
DROP TYPE IF EXISTS public.message_log_status_enum;


-- ─── 4) Limpar colunas WAHA + Remarketing + defaults de disparador ────────
ALTER TABLE public.company_settings
    DROP COLUMN IF EXISTS waha_session,
    DROP COLUMN IF EXISTS waha_api_url,
    DROP COLUMN IF EXISTS waha_api_key,
    DROP COLUMN IF EXISTS remarketing_enabled,
    DROP COLUMN IF EXISTS remarketing_delay_days,
    DROP COLUMN IF EXISTS remarketing_daily_limit,
    DROP COLUMN IF EXISTS remarketing_time,
    DROP COLUMN IF EXISTS remarketing_interval_min,
    DROP COLUMN IF EXISTS remarketing_interval_max,
    DROP COLUMN IF EXISTS remarketing_message,
    DROP COLUMN IF EXISTS default_interval_min,
    DROP COLUMN IF EXISTS default_interval_max,
    DROP COLUMN IF EXISTS default_daily_limit,
    DROP COLUMN IF EXISTS default_start_time,
    DROP COLUMN IF EXISTS default_end_time;


-- ─── 5) Drop sobra do remarketing em leads ─────────────────────────────────
ALTER TABLE public.leads
    DROP COLUMN IF EXISTS remarketing_sent_at,
    DROP COLUMN IF EXISTS last_interaction_at;


-- ─── 6) Validação ──────────────────────────────────────────────────────────
DO $$
DECLARE
    remaining_tables TEXT[];
    remaining_types TEXT[];
BEGIN
    SELECT array_agg(tablename ORDER BY tablename) INTO remaining_tables
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('campaigns', 'campaign_contacts', 'message_logs', 'bot_sessions');

    SELECT array_agg(typname ORDER BY typname) INTO remaining_types
    FROM pg_type
    WHERE typname IN ('campaign_status_enum', 'message_type_enum',
                      'contact_status_enum', 'message_log_status_enum');

    RAISE NOTICE 'Tabelas WhatsApp remanescentes (deve ser NULL): %', remaining_tables;
    RAISE NOTICE 'Enums de campanha remanescentes (deve ser NULL): %', remaining_types;

    IF remaining_tables IS NOT NULL OR remaining_types IS NOT NULL THEN
        RAISE WARNING 'Migration v3 não terminou limpa — revise manualmente.';
    END IF;
END$$;

COMMIT;
