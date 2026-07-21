-- =============================================================================
-- migration_clean_v1 — PARTE 3 de 4: NOT NULL + enums + FKs + indexes
-- =============================================================================

BEGIN;

-- ─── profiles.company_id NOT NULL (se possível) ─────────────────────────────

DO $$
DECLARE orphan_count INT;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM public.profiles WHERE company_id IS NULL;
    IF orphan_count > 0 THEN
        RAISE WARNING 'Existem % profiles sem company_id. Mantendo nullable.', orphan_count;
    ELSE
        ALTER TABLE public.profiles ALTER COLUMN company_id SET NOT NULL;
    END IF;
END$$;

-- ─── campaigns: enum status + enum message_type + NOT NULL ──────────────────

UPDATE public.campaigns SET status = 'draft' WHERE status IS NULL;
UPDATE public.campaigns SET status = 'draft'
    WHERE status NOT IN ('draft','ready','running','paused','completed','cancelled','archived');

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.campaigns
    ALTER COLUMN status TYPE campaign_status_enum USING status::campaign_status_enum,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'draft';

UPDATE public.campaigns SET message_type = 'text' WHERE message_type IS NULL;
UPDATE public.campaigns SET message_type = 'text'
    WHERE message_type NOT IN ('text','image','video','audio','document');

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_message_type_check;
ALTER TABLE public.campaigns ALTER COLUMN message_type DROP DEFAULT;
ALTER TABLE public.campaigns
    ALTER COLUMN message_type TYPE message_type_enum USING message_type::message_type_enum,
    ALTER COLUMN message_type SET NOT NULL,
    ALTER COLUMN message_type SET DEFAULT 'text';

DO $$
DECLARE orphan_count INT;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM public.campaigns
    WHERE company_id IS NULL OR user_id IS NULL;
    IF orphan_count > 0 THEN
        RAISE WARNING 'Existem % campaigns órfãs. Mantendo nullable.', orphan_count;
    ELSE
        ALTER TABLE public.campaigns
            ALTER COLUMN company_id SET NOT NULL,
            ALTER COLUMN user_id SET NOT NULL;
    END IF;
END$$;

UPDATE public.campaigns SET sent_count = 0 WHERE sent_count IS NULL;
UPDATE public.campaigns SET error_count = 0 WHERE error_count IS NULL;
UPDATE public.campaigns SET pending_count = 0 WHERE pending_count IS NULL;
UPDATE public.campaigns SET total_contacts = 0 WHERE total_contacts IS NULL;

ALTER TABLE public.campaigns
    ALTER COLUMN sent_count SET DEFAULT 0,
    ALTER COLUMN error_count SET DEFAULT 0,
    ALTER COLUMN pending_count SET DEFAULT 0,
    ALTER COLUMN total_contacts SET DEFAULT 0;

-- ─── campaign_contacts: enum + NOT NULL ─────────────────────────────────────

DO $$
DECLARE orphan_count INT;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM public.campaign_contacts WHERE campaign_id IS NULL;
    IF orphan_count > 0 THEN
        DELETE FROM public.campaign_contacts WHERE campaign_id IS NULL;
        RAISE NOTICE 'Removidos % campaign_contacts órfãos.', orphan_count;
    END IF;
    ALTER TABLE public.campaign_contacts ALTER COLUMN campaign_id SET NOT NULL;
END$$;

UPDATE public.campaign_contacts SET status = 'pending' WHERE status IS NULL;
UPDATE public.campaign_contacts SET status = 'pending'
    WHERE status NOT IN ('pending','sent','error','invalid','skipped');

ALTER TABLE public.campaign_contacts DROP CONSTRAINT IF EXISTS campaign_contacts_status_check;
ALTER TABLE public.campaign_contacts ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.campaign_contacts
    ALTER COLUMN status TYPE contact_status_enum USING status::contact_status_enum,
    ALTER COLUMN status SET DEFAULT 'pending';

-- ─── message_logs: enum + NOT NULL ──────────────────────────────────────────

DO $$
DECLARE orphan_count INT;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM public.message_logs WHERE campaign_id IS NULL;
    IF orphan_count > 0 THEN
        DELETE FROM public.message_logs WHERE campaign_id IS NULL;
        RAISE NOTICE 'Removidos % message_logs órfãos.', orphan_count;
    END IF;
    ALTER TABLE public.message_logs ALTER COLUMN campaign_id SET NOT NULL;
END$$;

UPDATE public.message_logs SET status = 'pending' WHERE status IS NULL;
UPDATE public.message_logs SET status = 'pending'
    WHERE status NOT IN ('pending','sent','error','delivered','read');

ALTER TABLE public.message_logs DROP CONSTRAINT IF EXISTS message_logs_status_check;
ALTER TABLE public.message_logs ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.message_logs
    ALTER COLUMN status TYPE message_log_status_enum USING status::message_log_status_enum,
    ALTER COLUMN status SET DEFAULT 'pending';

-- ─── notifications: defaults ────────────────────────────────────────────────

UPDATE public.notifications SET read = false WHERE read IS NULL;
ALTER TABLE public.notifications
    ALTER COLUMN read SET DEFAULT false,
    ALTER COLUMN read SET NOT NULL;

-- ─── FOREIGN KEYS ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.add_fk_if_missing(
    constraint_name text,
    table_name text,
    column_name text,
    ref_table text,
    ref_column text DEFAULT 'id',
    on_delete text DEFAULT 'NO ACTION'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = constraint_name
          AND conrelid = ('public.' || table_name)::regclass
    ) THEN
        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE %s',
            table_name, constraint_name, column_name, ref_table, ref_column, on_delete
        );
    END IF;
END$$;

SELECT pg_temp.add_fk_if_missing('profiles_company_id_fkey', 'profiles', 'company_id', 'companies', 'id', 'SET NULL');
SELECT pg_temp.add_fk_if_missing('user_quotas_company_id_fkey', 'user_quotas', 'company_id', 'companies', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('leads_company_id_fkey', 'leads', 'company_id', 'companies', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('leads_search_id_fkey', 'leads', 'search_id', 'search_history', 'id', 'SET NULL');
SELECT pg_temp.add_fk_if_missing('search_history_company_id_fkey', 'search_history', 'company_id', 'companies', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('campaigns_company_id_fkey', 'campaigns', 'company_id', 'companies', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('campaign_contacts_campaign_id_fkey', 'campaign_contacts', 'campaign_id', 'campaigns', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('message_logs_campaign_id_fkey', 'message_logs', 'campaign_id', 'campaigns', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('message_logs_contact_id_fkey', 'message_logs', 'contact_id', 'campaign_contacts', 'id', 'SET NULL');
SELECT pg_temp.add_fk_if_missing('notifications_company_id_fkey', 'notifications', 'company_id', 'companies', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('company_settings_company_id_fkey', 'company_settings', 'company_id', 'companies', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('bot_sessions_company_id_fkey', 'bot_sessions', 'company_id', 'companies', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('ip_whitelist_company_id_fkey', 'ip_whitelist', 'company_id', 'companies', 'id', 'CASCADE');
SELECT pg_temp.add_fk_if_missing('user_roles_company_id_fkey', 'user_roles', 'company_id', 'companies', 'id', 'CASCADE');

-- ─── INDEXES ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_company_id          ON public.leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_search_id           ON public.leads(search_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at          ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_company_created     ON public.leads(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_history_company_id ON public.search_history(company_id);
CREATE INDEX IF NOT EXISTS idx_search_history_user_id    ON public.search_history(user_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_company_id      ON public.campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id         ON public.campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status          ON public.campaigns(status);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id ON public.campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status      ON public.campaign_contacts(status);

CREATE INDEX IF NOT EXISTS idx_message_logs_campaign_id  ON public.message_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_sent_at      ON public.message_logs(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at     ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id        ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action         ON public.audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email      ON public.login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip         ON public.login_attempts(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_company_id       ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_quotas_company_id    ON public.user_quotas(company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id        ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role           ON public.user_roles(role);

COMMIT;
