-- =============================================================================
-- schema.sql — Setup COMPLETO do banco Client4you (baseline consolidada)
-- =============================================================================
-- Cria o banco do ZERO num projeto Supabase novo: extensões, ENUMs, tabelas
-- (na ordem certa de FK), índices, funções/RPCs e RLS (segurança multi-tenant).
--
-- Consolida o estado atual a partir de:
--   • Schema real das TABELAS exportado do banco vivo (Schema Visualizer).
--   • ENUMs, funções, RLS e índices extraídos das migrations do repo.
--
-- COMO RODAR:
--   Supabase Studio → SQL Editor → cole tudo → Run. Roda numa transação.
--   Requer um projeto Supabase (usa o schema `auth` e `auth.users`).
--
-- ⚠️ REVISAR ANTES DE PRODUÇÃO (itens que a fonte não deixou 100% explícitos):
--   1. `user_2fa.backup_codes`: o export mostrou só "ARRAY". Assumido `text[]`.
--   2. Para fidelidade 100% (defaults exóticos, grants finos, triggers de
--      auth), o ideal continua sendo um `pg_dump --schema-only`. Este arquivo
--      é uma baseline sólida — teste num projeto descartável antes de confiar.
--
--   (O enum `app_role` foi VERIFICADO no banco vivo — ver seção 1.)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0 — EXTENSÕES
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- =============================================================================
-- 1 — ENUM TYPES
-- =============================================================================
DO $$
BEGIN
    -- VERIFICADO no banco vivo (enum_range, 2026-07-21). Não está em migration
    -- (veio da base do Lovable). Ordem preservada.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE app_role AS ENUM ('super_admin', 'company_owner', 'admin', 'member');
    END IF;

    -- plan_id_enum: 'avancado' foi removido na migration clean_v2.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_id_enum') THEN
        CREATE TYPE plan_id_enum AS ENUM ('demo', 'basico', 'intermediario');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
        CREATE TYPE subscription_status_enum AS ENUM
            ('active', 'past_due', 'cancelled', 'suspended', 'expired');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_campaign_status_enum') THEN
        CREATE TYPE email_campaign_status_enum AS ENUM
            ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_recipient_status_enum') THEN
        CREATE TYPE email_recipient_status_enum AS ENUM
            ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'failed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_event_type_enum') THEN
        CREATE TYPE email_event_type_enum AS ENUM
            ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'complained');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrichment_job_status_enum') THEN
        CREATE TYPE enrichment_job_status_enum AS ENUM
            ('pending', 'processing', 'completed', 'failed');
    END IF;
END$$;

-- =============================================================================
-- 2 — TABELAS (ordem de dependência de FK)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.companies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    timezone text DEFAULT 'America/Sao_Paulo'::text,
    CONSTRAINT companies_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    company_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    session_token text,
    last_login_at timestamptz,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
    CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    role app_role NOT NULL DEFAULT 'member',
    company_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_roles_pkey PRIMARY KEY (id),
    CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT user_roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL UNIQUE,
    plan_id plan_id_enum NOT NULL DEFAULT 'demo',
    status subscription_status_enum NOT NULL DEFAULT 'expired',
    demo_used boolean DEFAULT false,
    current_period_start timestamptz DEFAULT now(),
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE IF NOT EXISTS public.company_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL UNIQUE,
    serpapi_key text,   -- legado (edge function search-leads removida) — sem uso hoje
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT company_settings_pkey PRIMARY KEY (id),
    CONSTRAINT company_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE IF NOT EXISTS public.search_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    user_id uuid,
    query text NOT NULL,
    location text NOT NULL,
    results_count integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT search_history_pkey PRIMARY KEY (id),
    CONSTRAINT search_history_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
    CONSTRAINT search_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.leads (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    search_id uuid,
    name text NOT NULL,
    phone text,
    email text,
    website text,
    address text,
    has_whatsapp boolean DEFAULT false,
    has_email boolean DEFAULT false,
    rating numeric,
    reviews_count integer DEFAULT 0,
    category text,
    created_at timestamptz NOT NULL DEFAULT now(),
    saved_at timestamptz,
    contact_url text,
    cnpj text,
    last_enrichment_attempted_at timestamptz,
    enrichment_source text,
    enrichment_confidence numeric,
    razao_social text,
    nome_fantasia text,
    cnae text,
    porte text,
    situacao_cadastral text,
    qsa jsonb,
    metadata_enriched_at timestamptz,
    latitude double precision,
    longitude double precision,
    CONSTRAINT leads_pkey PRIMARY KEY (id),
    CONSTRAINT leads_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
    CONSTRAINT leads_search_id_fkey FOREIGN KEY (search_id) REFERENCES public.search_history(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    company_id uuid,
    type varchar NOT NULL,
    title varchar NOT NULL,
    message text NOT NULL,
    link varchar,
    read boolean NOT NULL DEFAULT false,
    metadata jsonb,
    created_at timestamptz DEFAULT now(),
    read_at timestamptz,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE IF NOT EXISTS public.user_quotas (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    company_id uuid,
    leads_limit integer DEFAULT 5,
    leads_used integer NOT NULL DEFAULT 0,
    campaigns_limit integer DEFAULT 0,
    campaigns_used integer NOT NULL DEFAULT 0,
    messages_limit integer DEFAULT 0,
    messages_sent integer NOT NULL DEFAULT 0,
    reset_date date DEFAULT (CURRENT_DATE + '1 mon'::interval),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    emails_enriched_used integer NOT NULL DEFAULT 0,
    firecrawl_credits_spent_estimated numeric NOT NULL DEFAULT 0,
    cache_hits_count integer NOT NULL DEFAULT 0,
    reenrich_used integer NOT NULL DEFAULT 0,
    CONSTRAINT user_quotas_pkey PRIMARY KEY (id),
    CONSTRAINT user_quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT user_quotas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE IF NOT EXISTS public.login_attempts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    email text NOT NULL CHECK (char_length(email) <= 255),
    ip_address text NOT NULL,
    user_agent text,
    success boolean NOT NULL DEFAULT false,
    failure_reason text,
    turnstile_token text,
    turnstile_valid boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT login_attempts_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_2fa (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    secret text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    backup_codes text[],   -- ⚠️ export mostrou só "ARRAY"; assumido text[]
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_2fa_pkey PRIMARY KEY (id),
    CONSTRAINT user_2fa_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    user_email text NOT NULL,
    action text NOT NULL CHECK (char_length(action) <= 100),
    target_type text NOT NULL,
    target_id uuid,
    target_email text,
    details jsonb,
    ip_address text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
    CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.ip_whitelist (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    ip_address text NOT NULL CHECK (ip_address ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$'::text),
    description text,
    enabled boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_whitelist_pkey PRIMARY KEY (id),
    CONSTRAINT ip_whitelist_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
    CONSTRAINT ip_whitelist_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.email_accounts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    name varchar NOT NULL,
    from_email varchar NOT NULL,
    from_name varchar,
    reply_to varchar,
    smtp_host varchar NOT NULL,
    smtp_port integer NOT NULL DEFAULT 587,
    smtp_user varchar NOT NULL,
    smtp_pass_encrypted text NOT NULL,
    smtp_use_tls boolean NOT NULL DEFAULT true,
    daily_limit integer NOT NULL DEFAULT 100,
    is_verified boolean NOT NULL DEFAULT false,
    last_verified_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT email_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT email_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT email_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    CONSTRAINT email_accounts_user_from_email_key UNIQUE (user_id, from_email)
);

CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    user_id uuid,
    email_account_id uuid NOT NULL,
    name varchar NOT NULL,
    subject text NOT NULL,
    body_html text NOT NULL,
    body_text text,
    status email_campaign_status_enum NOT NULL DEFAULT 'draft',
    scheduled_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    total_recipients integer NOT NULL DEFAULT 0,
    sent_count integer NOT NULL DEFAULT 0,
    opened_count integer NOT NULL DEFAULT 0,
    clicked_count integer NOT NULL DEFAULT 0,
    bounced_count integer NOT NULL DEFAULT 0,
    unsubscribed_count integer NOT NULL DEFAULT 0,
    failed_count integer NOT NULL DEFAULT 0,
    interval_seconds integer NOT NULL DEFAULT 30,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT email_campaigns_pkey PRIMARY KEY (id),
    CONSTRAINT email_campaigns_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    CONSTRAINT email_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT email_campaigns_email_account_id_fkey FOREIGN KEY (email_account_id) REFERENCES public.email_accounts(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL,
    lead_id uuid,
    email varchar NOT NULL,
    name varchar,
    template_vars jsonb DEFAULT '{}'::jsonb,
    status email_recipient_status_enum NOT NULL DEFAULT 'pending',
    sent_at timestamptz,
    delivered_at timestamptz,
    first_opened_at timestamptz,
    last_opened_at timestamptz,
    open_count integer NOT NULL DEFAULT 0,
    first_clicked_at timestamptz,
    last_clicked_at timestamptz,
    click_count integer NOT NULL DEFAULT 0,
    bounced_at timestamptz,
    bounce_reason text,
    unsubscribed_at timestamptz,
    failed_at timestamptz,
    failure_reason text,
    tracking_token varchar NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT email_campaign_recipients_pkey PRIMARY KEY (id),
    CONSTRAINT email_campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
    CONSTRAINT email_campaign_recipients_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL,
    CONSTRAINT email_campaign_recipients_campaign_email_key UNIQUE (campaign_id, email)
);

CREATE TABLE IF NOT EXISTS public.email_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    recipient_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    event_type email_event_type_enum NOT NULL,
    user_agent text,
    ip_address text,
    link_url text,
    metadata jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT email_events_pkey PRIMARY KEY (id),
    CONSTRAINT email_events_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.email_campaign_recipients(id) ON DELETE CASCADE,
    CONSTRAINT email_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.domain_email_cache (
    domain text NOT NULL,
    email text,
    source text,
    confidence numeric,
    cost_usd numeric NOT NULL DEFAULT 0,
    scraped_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT domain_email_cache_pkey PRIMARY KEY (domain)
);

CREATE TABLE IF NOT EXISTS public.enrichment_jobs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status enrichment_job_status_enum NOT NULL DEFAULT 'pending',
    result_email text,
    result_source text,
    result_confidence numeric,
    result_cached boolean NOT NULL DEFAULT false,
    result_cost_usd numeric NOT NULL DEFAULT 0,
    result_extracted_cnpjs jsonb,
    error text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT enrichment_jobs_pkey PRIMARY KEY (id),
    CONSTRAINT enrichment_jobs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT enrichment_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    CONSTRAINT enrichment_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- =============================================================================
-- 3 — ÍNDICES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_leads_company_id            ON public.leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_search_id             ON public.leads(search_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at            ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_company_created       ON public.leads(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_company_saved         ON public.leads(company_id, saved_at) WHERE saved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company_cnpj          ON public.leads(company_id, cnpj);
CREATE INDEX IF NOT EXISTS idx_leads_last_enrichment_attempted_at ON public.leads(company_id, last_enrichment_attempted_at);

CREATE INDEX IF NOT EXISTS idx_search_history_company_id   ON public.search_history(company_id);
CREATE INDEX IF NOT EXISTS idx_search_history_user_id      ON public.search_history(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id       ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread   ON public.notifications(user_id, read) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at       ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id          ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action           ON public.audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email        ON public.login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip           ON public.login_attempts(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_company_id         ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_quotas_company_id      ON public.user_quotas(company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id          ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role             ON public.user_roles(role);

CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id           ON public.email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_company_id        ON public.email_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_company_id       ON public.email_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status           ON public.email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at     ON public.email_campaigns(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign_id     ON public.email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_status          ON public.email_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_email_recipients_tracking_token  ON public.email_campaign_recipients(tracking_token);
CREATE INDEX IF NOT EXISTS idx_email_recipients_lead_id         ON public.email_campaign_recipients(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient_id        ON public.email_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_id         ON public.email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at         ON public.email_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type               ON public.email_events(event_type);

CREATE INDEX IF NOT EXISTS idx_domain_email_cache_scraped_at    ON public.domain_email_cache(scraped_at);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_batch_status     ON public.enrichment_jobs(batch_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_batch_id         ON public.enrichment_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_company_created  ON public.enrichment_jobs(company_id, created_at DESC);

-- =============================================================================
-- 4 — FUNÇÕES
-- =============================================================================

-- 4.1 — Helpers de RLS (SECURITY DEFINER pra evitar recursão de RLS)
CREATE OR REPLACE FUNCTION public.user_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT company_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin') $$;

CREATE OR REPLACE FUNCTION public.is_company_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin','company_owner')) $$;

GRANT EXECUTE ON FUNCTION public.user_company_id()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_owner() TO authenticated;

-- 4.2 — Incremento atômico de contadores de quota (backend/service_role)
CREATE OR REPLACE FUNCTION public.increment_quota_atomic(
    p_user_id uuid, p_field text, p_amount numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_field NOT IN (
        'leads_used', 'campaigns_used', 'messages_sent',
        'emails_enriched_used', 'cache_hits_count',
        'firecrawl_credits_spent_estimated', 'reenrich_used'
    ) THEN
        RAISE EXCEPTION 'increment_quota_atomic: campo invalido %', p_field
            USING HINT = 'Adicione na whitelist da função antes de usar';
    END IF;
    EXECUTE format(
        'UPDATE public.user_quotas SET %1$I = %1$I + $2, updated_at = NOW() WHERE user_id = $1',
        p_field
    ) USING p_user_id, p_amount;
END;
$$;
REVOKE ALL ON FUNCTION public.increment_quota_atomic(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_quota_atomic(uuid, text, numeric) TO service_role;

-- 4.3 — Limpeza de buscas antigas (chamável via pg_cron; ver README)
CREATE OR REPLACE FUNCTION public.prune_old_search_data(days_to_keep INT DEFAULT 30)
RETURNS TABLE(deleted_leads BIGINT, deleted_history BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE cutoff TIMESTAMPTZ; d_leads BIGINT; d_hist BIGINT;
BEGIN
    cutoff := NOW() - (days_to_keep || ' days')::INTERVAL;
    WITH del AS (DELETE FROM public.leads WHERE saved_at IS NULL AND created_at < cutoff RETURNING 1)
        SELECT count(*) INTO d_leads FROM del;
    WITH del AS (DELETE FROM public.search_history WHERE created_at < cutoff RETURNING 1)
        SELECT count(*) INTO d_hist FROM del;
    RETURN QUERY SELECT d_leads, d_hist;
END;
$$;

-- =============================================================================
-- 5 — ROW LEVEL SECURITY
-- =============================================================================
-- Defense-in-depth: cada tabela liga RLS. `service_role` (backend) bypassa por
-- design. Tabelas sem policy de escrita = escrita só via service_role.

ALTER TABLE public.companies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quotas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_2fa                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_whitelist              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_email_cache        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_jobs           ENABLE ROW LEVEL SECURITY;

-- ---- companies ----
CREATE POLICY "companies_select_own_or_admin" ON public.companies
    FOR SELECT TO authenticated
    USING (id = public.user_company_id() OR public.is_super_admin());
CREATE POLICY "companies_admin_all" ON public.companies
    FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---- profiles ----
CREATE POLICY "profiles_select_self_or_same_company" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR company_id = public.user_company_id() OR public.is_super_admin());
CREATE POLICY "profiles_update_self" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_super_admin())
    WITH CHECK (id = auth.uid() OR public.is_super_admin());
CREATE POLICY "profiles_admin_all" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---- user_roles ----
CREATE POLICY "user_roles_select_self" ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "user_roles_admin_write" ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---- subscriptions ----
CREATE POLICY "subscriptions_select_own_company" ON public.subscriptions
    FOR SELECT TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin());
CREATE POLICY "subscriptions_admin_write" ON public.subscriptions
    FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---- company_settings ----
CREATE POLICY "company_settings_select_own" ON public.company_settings
    FOR SELECT TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin());
CREATE POLICY "company_settings_write_owner" ON public.company_settings
    FOR ALL TO authenticated
    USING ((company_id = public.user_company_id() AND public.is_company_owner()) OR public.is_super_admin())
    WITH CHECK ((company_id = public.user_company_id() AND public.is_company_owner()) OR public.is_super_admin());

-- ---- user_quotas (SELECT only; escrita via service_role) ----
CREATE POLICY "user_quotas_select_self_or_company_owner" ON public.user_quotas
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR (company_id = public.user_company_id() AND public.is_company_owner())
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

-- ---- notifications ----
CREATE POLICY "notifications_own" ON public.notifications
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- ---- audit_logs (admin read; write via service_role) ----
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
    FOR SELECT TO authenticated USING (public.is_super_admin());

-- ---- login_attempts (admin read; write via service_role) ----
CREATE POLICY "login_attempts_admin_read" ON public.login_attempts
    FOR SELECT TO authenticated USING (public.is_super_admin());

-- ---- ip_whitelist ----
CREATE POLICY "ip_whitelist_company_scoped" ON public.ip_whitelist
    FOR ALL TO authenticated
    USING ((company_id = public.user_company_id() AND public.is_company_owner()) OR public.is_super_admin())
    WITH CHECK ((company_id = public.user_company_id() AND public.is_company_owner()) OR public.is_super_admin());

-- ---- user_2fa ----
CREATE POLICY "user_2fa_own" ON public.user_2fa
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- ---- email_accounts ----
CREATE POLICY "email_accounts_own" ON public.email_accounts
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- ---- email_campaigns ----
CREATE POLICY "email_campaigns_company_scoped" ON public.email_campaigns
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

-- ---- email_campaign_recipients (via campaign) ----
CREATE POLICY "email_recipients_via_campaign" ON public.email_campaign_recipients
    FOR ALL TO authenticated
    USING (campaign_id IN (SELECT id FROM public.email_campaigns WHERE company_id = public.user_company_id()) OR public.is_super_admin())
    WITH CHECK (campaign_id IN (SELECT id FROM public.email_campaigns WHERE company_id = public.user_company_id()) OR public.is_super_admin());

-- ---- email_events (via recipient; write via service_role) ----
CREATE POLICY "email_events_via_recipient" ON public.email_events
    FOR SELECT TO authenticated
    USING (
        recipient_id IN (
            SELECT r.id FROM public.email_campaign_recipients r
            JOIN public.email_campaigns c ON c.id = r.campaign_id
            WHERE c.company_id = public.user_company_id()
        )
        OR public.is_super_admin()
    );

-- ---- domain_email_cache (global; service_role only) ----
CREATE POLICY "domain_email_cache_service_role_all" ON public.domain_email_cache
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---- enrichment_jobs (SELECT company-scoped; write via service_role) ----
CREATE POLICY "enrichment_jobs_select_company_scoped" ON public.enrichment_jobs
    FOR SELECT TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin());

-- =============================================================================
-- 6 — VIEWS
-- =============================================================================
-- Contagem de membros por empresa (usada em backend/routes/admin.py).
CREATE OR REPLACE VIEW public.company_member_counts AS
    SELECT company_id, count(*) AS total_members
    FROM public.profiles
    GROUP BY company_id;
GRANT SELECT ON public.company_member_counts TO authenticated, service_role;

COMMIT;

-- =============================================================================
-- FIM. Depois de rodar, confira o enum inferido:
--   SELECT unnest(enum_range(NULL::app_role));
-- =============================================================================
