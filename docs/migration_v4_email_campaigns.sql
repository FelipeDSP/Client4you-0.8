-- =============================================================================
-- migration_v4_email_campaigns.sql — Fase 1: Email Campaigns
-- =============================================================================
-- Cria a infraestrutura de banco para outreach via email:
--   1. ENUMs (campaign status, recipient status, event type)
--   2. email_accounts — credenciais SMTP por usuário (encriptadas via Fernet
--      do lado do backend, armazenadas como TEXT)
--   3. email_campaigns — definição da campanha
--   4. email_campaign_recipients — destinatários × campanha + estado
--   5. email_events — log de eventos (open/click/bounce/etc.)
--   6. Indexes para queries dos endpoints
--   7. RLS policies (company-scoped, com bypass via service_role)
--
-- COMO APLICAR:
--   Cole tudo no SQL Editor do Supabase e dê Run. BEGIN/COMMIT protege.
-- =============================================================================

BEGIN;

-- ─── 1) ENUMs ──────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_campaign_status_enum') THEN
        CREATE TYPE email_campaign_status_enum AS ENUM (
            'draft',       -- ainda sendo criada
            'scheduled',   -- agendada pra envio futuro
            'sending',     -- enviando agora
            'sent',        -- todos os destinatários processados
            'paused',      -- pausada manualmente
            'cancelled',   -- cancelada pelo user
            'failed'       -- falha geral (SMTP indisponível etc.)
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_recipient_status_enum') THEN
        CREATE TYPE email_recipient_status_enum AS ENUM (
            'pending',       -- aguardando envio
            'sent',          -- entregue ao servidor SMTP (250 OK)
            'delivered',     -- (futuro: bounce-back IMAP / webhook)
            'opened',        -- pixel disparado
            'clicked',       -- link clicado
            'bounced',       -- bounce duro (SMTP 5xx)
            'unsubscribed',  -- destinatário pediu opt-out
            'failed'         -- erro técnico no envio
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_event_type_enum') THEN
        CREATE TYPE email_event_type_enum AS ENUM (
            'sent',
            'delivered',
            'opened',
            'clicked',
            'bounced',
            'unsubscribed',
            'complained'  -- spam complaint (futuro: feedback loop)
        );
    END IF;
END$$;


-- ─── 2) email_accounts ─────────────────────────────────────────────────────
-- Credenciais SMTP do usuário. A senha é encriptada com Fernet no backend
-- antes do INSERT (chave em ENCRYPTION_KEY env var).

CREATE TABLE IF NOT EXISTS public.email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Identidade
    name VARCHAR(100) NOT NULL,                -- ex: "Gmail pessoal", "Outlook trabalho"
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    reply_to VARCHAR(255),

    -- SMTP config
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INT NOT NULL DEFAULT 587,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_pass_encrypted TEXT NOT NULL,         -- Fernet-encrypted
    smtp_use_tls BOOLEAN NOT NULL DEFAULT TRUE,

    -- Limites e estado
    daily_limit INT NOT NULL DEFAULT 100,      -- max emails/dia (config do user)
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_verified_at TIMESTAMPTZ,
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, from_email)
);


-- ─── 3) email_campaigns ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email_account_id UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE RESTRICT,

    -- Conteúdo
    name VARCHAR(200) NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,                            -- fallback texto plano

    -- Estado
    status email_campaign_status_enum NOT NULL DEFAULT 'draft',
    scheduled_at TIMESTAMPTZ,                  -- envio agendado
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Contadores denormalizados (atualizados pelo worker)
    total_recipients INT NOT NULL DEFAULT 0,
    sent_count INT NOT NULL DEFAULT 0,
    opened_count INT NOT NULL DEFAULT 0,
    clicked_count INT NOT NULL DEFAULT 0,
    bounced_count INT NOT NULL DEFAULT 0,
    unsubscribed_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,

    -- Settings de envio
    interval_seconds INT NOT NULL DEFAULT 30,  -- delay entre envios

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── 4) email_campaign_recipients ─────────────────────────────────────────
-- Uma linha por (campanha × lead). Snapshot dos dados pro caso de o lead
-- ser deletado depois.

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,

    -- Snapshot do destinatário
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    -- Para substituição de variáveis no template ({{nome}}, {{empresa}}, etc.)
    template_vars JSONB DEFAULT '{}'::jsonb,

    status email_recipient_status_enum NOT NULL DEFAULT 'pending',

    -- Timestamps por evento
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    first_opened_at TIMESTAMPTZ,
    last_opened_at TIMESTAMPTZ,
    open_count INT NOT NULL DEFAULT 0,
    first_clicked_at TIMESTAMPTZ,
    last_clicked_at TIMESTAMPTZ,
    click_count INT NOT NULL DEFAULT 0,
    bounced_at TIMESTAMPTZ,
    bounce_reason TEXT,
    unsubscribed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,

    -- Token único usado em pixel/click/unsubscribe URLs (URL-safe random)
    tracking_token VARCHAR(64) UNIQUE NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (campaign_id, email)
);


-- ─── 5) email_events ──────────────────────────────────────────────────────
-- Log de eventos raw, pra auditoria e analytics.

CREATE TABLE IF NOT EXISTS public.email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.email_campaign_recipients(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,

    event_type email_event_type_enum NOT NULL,

    -- Metadata
    user_agent TEXT,
    ip_address TEXT,
    link_url TEXT,                             -- pra clicks
    metadata JSONB,

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── 6) Indexes ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id          ON public.email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_company_id       ON public.email_accounts(company_id);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_company_id      ON public.email_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status          ON public.email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at    ON public.email_campaigns(scheduled_at) WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign_id    ON public.email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_status         ON public.email_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_email_recipients_tracking_token ON public.email_campaign_recipients(tracking_token);
CREATE INDEX IF NOT EXISTS idx_email_recipients_lead_id        ON public.email_campaign_recipients(lead_id);

CREATE INDEX IF NOT EXISTS idx_email_events_recipient_id       ON public.email_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_id        ON public.email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at        ON public.email_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type               ON public.email_events(event_type);


-- ─── 7) Row Level Security ─────────────────────────────────────────────────
-- Usa as helper functions criadas na migration v1:
--   public.user_company_id() → company_id do usuário logado
--   public.is_super_admin()  → boolean

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_accounts_own" ON public.email_accounts;
CREATE POLICY "email_accounts_own" ON public.email_accounts
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_campaigns_company_scoped" ON public.email_campaigns;
CREATE POLICY "email_campaigns_company_scoped" ON public.email_campaigns
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_recipients_via_campaign" ON public.email_campaign_recipients;
CREATE POLICY "email_recipients_via_campaign" ON public.email_campaign_recipients
    FOR ALL TO authenticated
    USING (
        campaign_id IN (
            SELECT id FROM public.email_campaigns
            WHERE company_id = public.user_company_id()
        )
        OR public.is_super_admin()
    )
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.email_campaigns
            WHERE company_id = public.user_company_id()
        )
        OR public.is_super_admin()
    );

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_events_via_recipient" ON public.email_events;
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
-- INSERTs em email_events só via service_role (worker e tracking endpoints).


-- ─── 8) Validação final ────────────────────────────────────────────────────
DO $$
DECLARE
    tables_count INT;
    enums_count INT;
BEGIN
    SELECT COUNT(*) INTO tables_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('email_accounts', 'email_campaigns',
                        'email_campaign_recipients', 'email_events');

    SELECT COUNT(*) INTO enums_count
    FROM pg_type
    WHERE typname IN ('email_campaign_status_enum',
                      'email_recipient_status_enum',
                      'email_event_type_enum');

    RAISE NOTICE 'Tabelas de email criadas: %/4', tables_count;
    RAISE NOTICE 'ENUMs de email criados: %/3', enums_count;

    IF tables_count < 4 OR enums_count < 3 THEN
        RAISE WARNING 'Migration v4 incompleta — revise.';
    END IF;
END$$;

COMMIT;
