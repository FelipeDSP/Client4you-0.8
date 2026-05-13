-- =============================================================================
-- migration_clean_v1 — PARTE 1 de 4: ENUMs + consolidação agent_*
-- =============================================================================
-- Esta parte é rápida (~5s). Cria os tipos enumerados e remove os campos
-- duplicados de agent_* em company_settings (canônico fica em agent_configs).
-- =============================================================================

BEGIN;

-- ─── ENUMs ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_id_enum') THEN
        CREATE TYPE plan_id_enum AS ENUM (
            'demo', 'basico', 'intermediario', 'avancado'
        );
    END IF;

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

-- ─── Consolidação agent_configs ⟷ company_settings ──────────────────────────

ALTER TABLE public.agent_configs
    ALTER COLUMN company_id SET NOT NULL;

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

COMMIT;
