-- =============================================================================
-- migration_clean_v1.sql — Reset cirúrgico Client4you
-- Data: 2026-05-13
-- =============================================================================
--
-- DECISÕES (validadas com o usuário):
-- 1. `agent_configs` é a tabela canônica do agente IA. Os campos `agent_*` de
--    `company_settings` são removidos.
-- 2. `subscriptions` é a fonte da verdade do PLANO (escopo: company_id UNIQUE).
--    `user_quotas` vira apenas contador de uso (leads_used, campaigns_used,
--    messages_sent, reset_date). Limites de plano vivem no código backend
--    (constante PLAN_LIMITS), não no banco.
-- 3. Tipos `text` para status viram ENUMs.
-- 4. RLS é reescrita por tabela. Defense-in-depth com funções helper.
-- 5. NOT NULL aplicado onde estava nullable indevidamente.
--
-- COMO APLICAR:
-- 1. Faça backup primeiro:
--    pg_dump "SUA_CONN_URI" --no-owner --no-acl --schema=public --schema=auth \
--      -f backup_pre_v1.sql
-- 2. Cole este arquivo no SQL Editor do Supabase.
-- 3. Rode tudo (Ctrl+Enter). Está em uma transação — se algo falhar, nada é
--    aplicado. Se você quiser TESTAR sem aplicar, troque o COMMIT do final
--    por ROLLBACK temporariamente.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SEÇÃO 1 — ENUMs
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_id_enum') THEN
        CREATE TYPE plan_id_enum AS ENUM (
            'demo', 'basico', 'intermediario', 'avancado'
        );
    END IF;

    -- ENUMs alinhados ao vocabulário JÁ usado no banco atual
    -- (descoberto via diagnóstico). Mantemos compatibilidade com dados existentes.

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
        CREATE TYPE subscription_status_enum AS ENUM (
            'active', 'past_due', 'cancelled', 'suspended', 'expired'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status_enum') THEN
        CREATE TYPE campaign_status_enum AS ENUM (
            'draft', 'ready', 'running', 'paused', 'completed', 'cancelled', 'archived'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type_enum') THEN
        CREATE TYPE message_type_enum AS ENUM (
            'text', 'image', 'video', 'audio', 'document'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_status_enum') THEN
        CREATE TYPE contact_status_enum AS ENUM (
            'pending', 'sent', 'error', 'invalid', 'skipped'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_log_status_enum') THEN
        CREATE TYPE message_log_status_enum AS ENUM (
            'pending', 'sent', 'error', 'delivered', 'read'
        );
    END IF;
END$$;


-- =============================================================================
-- SEÇÃO 2 — CONSOLIDAÇÃO `agent_configs` ⟷ `company_settings`
-- =============================================================================
-- `agent_configs` já existe e é mais completa. Apenas removemos os duplicados
-- de company_settings e garantimos integridade.

-- 2.1 — Garantir que agent_configs tem FK e NOT NULL no company_id
ALTER TABLE public.agent_configs
    ALTER COLUMN company_id SET NOT NULL;

-- FK condicional (só adiciona se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'agent_configs_company_id_fkey'
          AND conrelid = 'public.agent_configs'::regclass
    ) THEN
        ALTER TABLE public.agent_configs
            ADD CONSTRAINT agent_configs_company_id_fkey
            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
END$$;

-- 2.2 — Drop dos campos agent_* duplicados em company_settings
ALTER TABLE public.company_settings
    DROP COLUMN IF EXISTS agent_enabled,
    DROP COLUMN IF EXISTS agent_name,
    DROP COLUMN IF EXISTS agent_tone,
    DROP COLUMN IF EXISTS agent_personality,
    DROP COLUMN IF EXISTS agent_system_prompt,
    DROP COLUMN IF EXISTS agent_welcome_message,
    DROP COLUMN IF EXISTS agent_response_delay,
    DROP COLUMN IF EXISTS agent_max_response_length,
    DROP COLUMN IF EXISTS agent_working_hours_enabled,
    DROP COLUMN IF EXISTS agent_working_hours_start,
    DROP COLUMN IF EXISTS agent_working_hours_end,
    DROP COLUMN IF EXISTS agent_auto_qualify,
    DROP COLUMN IF EXISTS agent_qualification_questions,
    DROP COLUMN IF EXISTS agent_blocked_topics;


-- =============================================================================
-- SEÇÃO 3 — CONSOLIDAÇÃO `subscriptions` ⟷ `user_quotas`
-- =============================================================================

-- 3.1 — Converter subscriptions.plan_id e .status para enums
-- Primeiro garante que valores existentes mapeiam (com 0 users, normalmente vazio)
UPDATE public.subscriptions
SET plan_id = LOWER(TRIM(plan_id))
WHERE plan_id IS NOT NULL;

-- Mapeia valores fora do enum para 'demo' (defensivo)
UPDATE public.subscriptions
SET plan_id = 'demo'
WHERE plan_id IS NULL
   OR plan_id NOT IN ('demo', 'basico', 'intermediario', 'avancado');

-- DROP DEFAULT antes de mudar tipo (PostgreSQL não auto-converte default text→enum)
ALTER TABLE public.subscriptions ALTER COLUMN plan_id DROP DEFAULT;
ALTER TABLE public.subscriptions
    ALTER COLUMN plan_id TYPE plan_id_enum USING plan_id::plan_id_enum,
    ALTER COLUMN plan_id SET NOT NULL,
    ALTER COLUMN plan_id SET DEFAULT 'demo';

UPDATE public.subscriptions
SET status = 'expired'
WHERE status NOT IN ('active', 'past_due', 'cancelled', 'suspended', 'expired')
   OR status IS NULL;

-- Drop CHECK constraint antiga em texto antes da conversão pra enum
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.subscriptions
    ALTER COLUMN status TYPE subscription_status_enum USING status::subscription_status_enum,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'expired';

-- 3.2 — FK de subscriptions.company_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'subscriptions_company_id_fkey'
          AND conrelid = 'public.subscriptions'::regclass
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_company_id_fkey
            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
END$$;

-- 3.3 — Migrar info de plano de user_quotas → subscriptions (defensivo, com 0 users
-- normalmente não tem nada, mas evita perda caso existam dados de teste)
INSERT INTO public.subscriptions (company_id, plan_id, status, current_period_end, created_at, updated_at)
SELECT DISTINCT
    uq.company_id,
    CASE
        WHEN LOWER(COALESCE(uq.plan_type, uq.plan_name)) IN ('demo','basico','intermediario','avancado')
            THEN LOWER(COALESCE(uq.plan_type, uq.plan_name))::plan_id_enum
        ELSE 'demo'::plan_id_enum
    END,
    CASE
        WHEN COALESCE(uq.plan_type, '') = 'suspended' THEN 'suspended'::subscription_status_enum
        WHEN uq.plan_expires_at IS NOT NULL AND uq.plan_expires_at > NOW() THEN 'active'::subscription_status_enum
        WHEN uq.plan_expires_at IS NOT NULL AND uq.plan_expires_at <= NOW() THEN 'expired'::subscription_status_enum
        ELSE 'active'::subscription_status_enum
    END::subscription_status_enum,
    uq.plan_expires_at,
    COALESCE(uq.created_at, NOW()),
    COALESCE(uq.updated_at, NOW())
FROM public.user_quotas uq
WHERE uq.company_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s WHERE s.company_id = uq.company_id
  );

-- 3.4 — Drop dos campos de plano em user_quotas (vira só contador)
ALTER TABLE public.user_quotas
    DROP COLUMN IF EXISTS plan_type,
    DROP COLUMN IF EXISTS plan_name,
    DROP COLUMN IF EXISTS plan_expires_at;

-- 3.5 — Garantir defaults dos contadores
ALTER TABLE public.user_quotas
    ALTER COLUMN leads_used SET DEFAULT 0,
    ALTER COLUMN campaigns_used SET DEFAULT 0,
    ALTER COLUMN messages_sent SET DEFAULT 0;

UPDATE public.user_quotas SET leads_used = 0 WHERE leads_used IS NULL;
UPDATE public.user_quotas SET campaigns_used = 0 WHERE campaigns_used IS NULL;
UPDATE public.user_quotas SET messages_sent = 0 WHERE messages_sent IS NULL;

ALTER TABLE public.user_quotas
    ALTER COLUMN leads_used SET NOT NULL,
    ALTER COLUMN campaigns_used SET NOT NULL,
    ALTER COLUMN messages_sent SET NOT NULL;


-- =============================================================================
-- SEÇÃO 4 — NOT NULL e ENUMs nas tabelas restantes
-- =============================================================================

-- 4.1 — profiles.company_id NOT NULL (signup deve criar a company atomicamente)
-- Pré-condição: garantir que todos os profiles existentes têm company_id
DO $$
DECLARE
    orphan_count INT;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM public.profiles WHERE company_id IS NULL;
    IF orphan_count > 0 THEN
        RAISE WARNING 'Existem % profiles sem company_id. Eles ficarão nullable até serem corrigidos.', orphan_count;
    ELSE
        ALTER TABLE public.profiles ALTER COLUMN company_id SET NOT NULL;
    END IF;
END$$;

-- 4.2 — campaigns NOT NULL nos campos essenciais
UPDATE public.campaigns SET status = 'draft' WHERE status IS NULL;
UPDATE public.campaigns SET status = 'draft'
    WHERE status NOT IN ('draft','ready','running','paused','completed','cancelled','archived');

-- Drop CHECK constraint antiga (texto fechado) antes de converter pra enum
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

-- campaigns.company_id e .user_id NOT NULL (campanhas órfãs não fazem sentido)
DO $$
DECLARE
    orphan_count INT;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM public.campaigns
    WHERE company_id IS NULL OR user_id IS NULL;
    IF orphan_count > 0 THEN
        RAISE WARNING 'Existem % campaigns órfãs (company_id ou user_id null). Não aplicando NOT NULL.', orphan_count;
    ELSE
        ALTER TABLE public.campaigns
            ALTER COLUMN company_id SET NOT NULL,
            ALTER COLUMN user_id SET NOT NULL;
    END IF;
END$$;

-- defaults sensatos para contadores em campaigns
UPDATE public.campaigns SET sent_count = 0 WHERE sent_count IS NULL;
UPDATE public.campaigns SET error_count = 0 WHERE error_count IS NULL;
UPDATE public.campaigns SET pending_count = 0 WHERE pending_count IS NULL;
UPDATE public.campaigns SET total_contacts = 0 WHERE total_contacts IS NULL;

ALTER TABLE public.campaigns
    ALTER COLUMN sent_count SET DEFAULT 0,
    ALTER COLUMN error_count SET DEFAULT 0,
    ALTER COLUMN pending_count SET DEFAULT 0,
    ALTER COLUMN total_contacts SET DEFAULT 0;

-- 4.3 — campaign_contacts.campaign_id NOT NULL e enum
DO $$
DECLARE orphan_count INT;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM public.campaign_contacts WHERE campaign_id IS NULL;
    IF orphan_count > 0 THEN
        DELETE FROM public.campaign_contacts WHERE campaign_id IS NULL;
        RAISE NOTICE 'Removidos % campaign_contacts órfãos (campaign_id null).', orphan_count;
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

-- 4.4 — message_logs.campaign_id NOT NULL e enum
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

-- 4.5 — notifications: garantir defaults
UPDATE public.notifications SET read = false WHERE read IS NULL;
ALTER TABLE public.notifications
    ALTER COLUMN read SET DEFAULT false,
    ALTER COLUMN read SET NOT NULL;


-- =============================================================================
-- SEÇÃO 5 — FOREIGN KEYS
-- =============================================================================
-- Adiciona FKs faltantes para garantir integridade referencial.

-- Helper inline pra adicionar FK só se não existir
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


-- =============================================================================
-- SEÇÃO 6 — INDEXES
-- =============================================================================
-- Cobre os .eq() / .in_() mais usados pelo código.

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


-- =============================================================================
-- SEÇÃO 7 — FUNÇÕES HELPER + ROW LEVEL SECURITY
-- =============================================================================
-- Defense-in-depth: cada tabela pública tem RLS com policies explícitas.
-- `service_role` ignora RLS por design — usado pelo backend e webhooks.

-- 7.1 — Helper functions (SECURITY DEFINER para evitar recursão de RLS)

CREATE OR REPLACE FUNCTION public.user_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    )
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('super_admin','company_owner')
    )
$$;

GRANT EXECUTE ON FUNCTION public.user_company_id()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_owner() TO authenticated;

-- 7.2 — Habilitar RLS em TODAS as tabelas e dropar policies antigas

DO $$
DECLARE
    t text;
    pol record;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        -- Dropa todas as policies existentes da tabela
        FOR pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
        END LOOP;
    END LOOP;
END$$;

-- 7.3 — Policies por tabela

-- ---- companies ----
CREATE POLICY "companies_select_own_or_admin" ON public.companies
    FOR SELECT TO authenticated
    USING (id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "companies_admin_all" ON public.companies
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- ---- profiles ----
CREATE POLICY "profiles_select_self_or_same_company" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR company_id = public.user_company_id()
        OR public.is_super_admin()
    );

CREATE POLICY "profiles_update_self" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_super_admin())
    WITH CHECK (id = auth.uid() OR public.is_super_admin());

CREATE POLICY "profiles_admin_all" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- ---- user_roles ----
CREATE POLICY "user_roles_select_self" ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "user_roles_admin_write" ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- ---- user_quotas (counters) ----
CREATE POLICY "user_quotas_select_self_or_company_owner" ON public.user_quotas
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    );

-- Escrita só por service_role (não há policy = bloqueado para authenticated)

-- ---- subscriptions ----
CREATE POLICY "subscriptions_select_own_company" ON public.subscriptions
    FOR SELECT TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "subscriptions_admin_write" ON public.subscriptions
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- ---- companies (settings) ----
CREATE POLICY "company_settings_select_own" ON public.company_settings
    FOR SELECT TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "company_settings_write_owner" ON public.company_settings
    FOR ALL TO authenticated
    USING (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    )
    WITH CHECK (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    );

-- ---- agent_configs ----
CREATE POLICY "agent_configs_select_own" ON public.agent_configs
    FOR SELECT TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "agent_configs_write_owner" ON public.agent_configs
    FOR ALL TO authenticated
    USING (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    )
    WITH CHECK (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    );

-- ---- leads ----
CREATE POLICY "leads_company_scoped" ON public.leads
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

-- ---- search_history ----
CREATE POLICY "search_history_company_scoped" ON public.search_history
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

-- ---- campaigns ----
CREATE POLICY "campaigns_company_scoped" ON public.campaigns
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

-- ---- campaign_contacts (via JOIN com campaigns) ----
CREATE POLICY "campaign_contacts_via_campaign" ON public.campaign_contacts
    FOR ALL TO authenticated
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE company_id = public.user_company_id()
        )
        OR public.is_super_admin()
    )
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE company_id = public.user_company_id()
        )
        OR public.is_super_admin()
    );

-- ---- message_logs (via campaign) ----
CREATE POLICY "message_logs_via_campaign" ON public.message_logs
    FOR SELECT TO authenticated
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE company_id = public.user_company_id()
        )
        OR public.is_super_admin()
    );
-- INSERT/UPDATE/DELETE só via service_role

-- ---- notifications ----
CREATE POLICY "notifications_own" ON public.notifications
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- ---- bot_sessions ----
CREATE POLICY "bot_sessions_company_scoped" ON public.bot_sessions
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

-- ---- audit_logs (admin-only read, service-role write) ----
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_super_admin());
-- Sem policy de write = bloqueado para authenticated. Inserções via service_role.

-- ---- login_attempts (admin-only read, service-role write) ----
CREATE POLICY "login_attempts_admin_read" ON public.login_attempts
    FOR SELECT TO authenticated
    USING (public.is_super_admin());

-- ---- ip_whitelist ----
CREATE POLICY "ip_whitelist_company_scoped" ON public.ip_whitelist
    FOR ALL TO authenticated
    USING (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    )
    WITH CHECK (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    );

-- ---- user_2fa (próprio usuário) ----
CREATE POLICY "user_2fa_own" ON public.user_2fa
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_super_admin());


-- =============================================================================
-- SEÇÃO 8 — VALIDAÇÃO FINAL (diagnóstico)
-- =============================================================================
-- Roda alguns SELECTs no final para confirmar o estado. Não altera nada.

DO $$
DECLARE
    rls_off_count INT;
    no_policy_count INT;
BEGIN
    -- Tabelas sem RLS
    SELECT COUNT(*) INTO rls_off_count
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;

    -- Tabelas com RLS mas sem policy (= ninguém lê)
    SELECT COUNT(*) INTO no_policy_count
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
      AND (SELECT COUNT(*) FROM pg_policy p WHERE p.polrelid = c.oid) = 0;

    RAISE NOTICE 'Tabelas sem RLS: %. Tabelas com RLS mas sem policy: %.', rls_off_count, no_policy_count;
    IF rls_off_count > 0 OR no_policy_count > 0 THEN
        RAISE WARNING 'Existem buracos de RLS — revise manualmente.';
    END IF;
END$$;


-- =============================================================================
-- FIM. Troque COMMIT por ROLLBACK se quiser apenas testar.
-- =============================================================================
COMMIT;
