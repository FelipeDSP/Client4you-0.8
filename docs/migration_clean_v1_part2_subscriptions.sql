-- =============================================================================
-- migration_clean_v1 — PARTE 2 de 4: consolidação subscriptions ⟷ user_quotas
-- =============================================================================
-- subscriptions = fonte da verdade do PLANO (por company_id).
-- user_quotas = só contador de uso.
-- =============================================================================

BEGIN;

-- ─── subscriptions.plan_id: text → plan_id_enum ─────────────────────────────

UPDATE public.subscriptions
SET plan_id = LOWER(TRIM(plan_id))
WHERE plan_id IS NOT NULL;

UPDATE public.subscriptions
SET plan_id = 'demo'
WHERE plan_id IS NULL
   OR plan_id NOT IN ('demo', 'basico', 'intermediario', 'avancado');

ALTER TABLE public.subscriptions ALTER COLUMN plan_id DROP DEFAULT;
ALTER TABLE public.subscriptions
    ALTER COLUMN plan_id TYPE plan_id_enum USING plan_id::plan_id_enum,
    ALTER COLUMN plan_id SET NOT NULL,
    ALTER COLUMN plan_id SET DEFAULT 'demo';

-- ─── subscriptions.status: text → subscription_status_enum ──────────────────

UPDATE public.subscriptions
SET status = 'expired'
WHERE status NOT IN ('active', 'past_due', 'cancelled', 'suspended', 'expired')
   OR status IS NULL;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.subscriptions
    ALTER COLUMN status TYPE subscription_status_enum USING status::subscription_status_enum,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'expired';

-- ─── FK subscriptions.company_id → companies.id ─────────────────────────────

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

-- ─── Migrar plano de user_quotas → subscriptions (defensivo) ────────────────

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
    END,
    uq.plan_expires_at,
    COALESCE(uq.created_at, NOW()),
    COALESCE(uq.updated_at, NOW())
FROM public.user_quotas uq
WHERE uq.company_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s WHERE s.company_id = uq.company_id
  );

-- ─── Drop campos de plano em user_quotas (vira só contador) ─────────────────

ALTER TABLE public.user_quotas
    DROP COLUMN IF EXISTS plan_type,
    DROP COLUMN IF EXISTS plan_name,
    DROP COLUMN IF EXISTS plan_expires_at;

-- Defaults dos contadores
UPDATE public.user_quotas SET leads_used = 0 WHERE leads_used IS NULL;
UPDATE public.user_quotas SET campaigns_used = 0 WHERE campaigns_used IS NULL;
UPDATE public.user_quotas SET messages_sent = 0 WHERE messages_sent IS NULL;

ALTER TABLE public.user_quotas
    ALTER COLUMN leads_used SET DEFAULT 0,
    ALTER COLUMN campaigns_used SET DEFAULT 0,
    ALTER COLUMN messages_sent SET DEFAULT 0,
    ALTER COLUMN leads_used SET NOT NULL,
    ALTER COLUMN campaigns_used SET NOT NULL,
    ALTER COLUMN messages_sent SET NOT NULL;

COMMIT;
