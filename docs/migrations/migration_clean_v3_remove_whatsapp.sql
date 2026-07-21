-- =============================================================================
-- migration_clean_v3_remove_whatsapp.sql — Remoção do feature WhatsApp/Disparador
-- =============================================================================
-- A plataforma está pivotando de "outreach via WhatsApp" para "outreach via
-- email + gestão de leads". Esta migration:
--   1. Desagenda cron jobs que referenciam tabelas removidas
--   2. Dropa triggers e functions deprecated (sync_remarketing_cron etc.)
--   3. Dropa views dependentes
--   4. Dropa as tabelas de campanha (campaigns, campaign_contacts,
--      message_logs, bot_sessions). Tudo cascateia.
--   5. Dropa os ENUMs específicos de campanha.
--   6. Limpa colunas WAHA/remarketing de company_settings (com CASCADE,
--      pra pegar qualquer trigger/index/check dependente).
--   7. Dropa coluna `remarketing_sent_at` e `last_interaction_at` de leads.
--
-- Mantemos `leads.has_whatsapp` porque é metadado útil de prospecção (saber
-- se o lead tem WhatsApp ajuda a priorizar emails).
--
-- COMO APLICAR:
--   Cole tudo no SQL Editor do Supabase e dê Run. BEGIN/COMMIT protege:
--   se algo falhar, nada é aplicado.
-- =============================================================================

BEGIN;

-- ─── 1) Desativar cron jobs que referenciam tabelas/funções a sumirem ─────
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT jobname FROM cron.job
        WHERE jobname ILIKE '%remarketing%'
           OR jobname = 'daily-cleanup'
    LOOP
        PERFORM cron.unschedule(r.jobname);
        RAISE NOTICE 'Unscheduled cron job: %', r.jobname;
    END LOOP;
END$$;


-- ─── 2) Drop triggers e functions deprecated ───────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_remarketing_cron ON public.company_settings;

DROP FUNCTION IF EXISTS public.sync_remarketing_cron() CASCADE;
DROP FUNCTION IF EXISTS public.sync_remarketing_cron_for_company() CASCADE;
DROP FUNCTION IF EXISTS public.clean_old_message_logs() CASCADE;


-- ─── 3) Drop views dependentes ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.dashboard_campaign_stats;


-- ─── 4) Drop tabelas de campanha (CASCADE limpa FKs/indexes/policies) ─────
DROP TABLE IF EXISTS public.message_logs CASCADE;
DROP TABLE IF EXISTS public.campaign_contacts CASCADE;
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.bot_sessions CASCADE;


-- ─── 5) Drop ENUMs específicos de campanha ─────────────────────────────────
DROP TYPE IF EXISTS public.campaign_status_enum;
DROP TYPE IF EXISTS public.message_type_enum;
DROP TYPE IF EXISTS public.contact_status_enum;
DROP TYPE IF EXISTS public.message_log_status_enum;


-- ─── 6) Limpar colunas WAHA + Remarketing + defaults de disparador ────────
ALTER TABLE public.company_settings
    DROP COLUMN IF EXISTS waha_session CASCADE,
    DROP COLUMN IF EXISTS waha_api_url CASCADE,
    DROP COLUMN IF EXISTS waha_api_key CASCADE,
    DROP COLUMN IF EXISTS remarketing_enabled CASCADE,
    DROP COLUMN IF EXISTS remarketing_delay_days CASCADE,
    DROP COLUMN IF EXISTS remarketing_daily_limit CASCADE,
    DROP COLUMN IF EXISTS remarketing_time CASCADE,
    DROP COLUMN IF EXISTS remarketing_interval_min CASCADE,
    DROP COLUMN IF EXISTS remarketing_interval_max CASCADE,
    DROP COLUMN IF EXISTS remarketing_message CASCADE,
    DROP COLUMN IF EXISTS default_interval_min CASCADE,
    DROP COLUMN IF EXISTS default_interval_max CASCADE,
    DROP COLUMN IF EXISTS default_daily_limit CASCADE,
    DROP COLUMN IF EXISTS default_start_time CASCADE,
    DROP COLUMN IF EXISTS default_end_time CASCADE;


-- ─── 7) Drop sobra do remarketing em leads ─────────────────────────────────
ALTER TABLE public.leads
    DROP COLUMN IF EXISTS remarketing_sent_at CASCADE,
    DROP COLUMN IF EXISTS last_interaction_at CASCADE;


-- ─── 8) Validação ──────────────────────────────────────────────────────────
DO $$
DECLARE
    remaining_tables TEXT[];
    remaining_types TEXT[];
    remaining_triggers INT;
BEGIN
    SELECT array_agg(tablename ORDER BY tablename) INTO remaining_tables
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('campaigns', 'campaign_contacts', 'message_logs', 'bot_sessions');

    SELECT array_agg(typname ORDER BY typname) INTO remaining_types
    FROM pg_type
    WHERE typname IN ('campaign_status_enum', 'message_type_enum',
                      'contact_status_enum', 'message_log_status_enum');

    SELECT COUNT(*) INTO remaining_triggers
    FROM pg_trigger
    WHERE tgname = 'trg_sync_remarketing_cron';

    RAISE NOTICE 'Tabelas WhatsApp remanescentes (deve ser NULL): %', remaining_tables;
    RAISE NOTICE 'Enums de campanha remanescentes (deve ser NULL): %', remaining_types;
    RAISE NOTICE 'Trigger remarketing remanescente (deve ser 0): %', remaining_triggers;

    IF remaining_tables IS NOT NULL OR remaining_types IS NOT NULL OR remaining_triggers > 0 THEN
        RAISE WARNING 'Migration v3 não terminou limpa — revise manualmente.';
    END IF;
END$$;

COMMIT;
