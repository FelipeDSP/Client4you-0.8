-- =========================================================================
-- MIGRATION v12 — enrichment_jobs (PR 5: fila assíncrona de enrichment)
-- =========================================================================
-- Tabela de jobs pra enrichment de email assíncrono. 1 linha POR LEAD dentro
-- de um batch. O batch agrupa N leads que vieram juntos numa request
-- POST /enrich-emails/async; cada lead vira 1 job pending → o worker
-- (enrichment_worker.py) processa em ordem, atualiza status + result_*.
--
-- Padrão espelhado de email_campaign_recipients (migration v4):
-- - status enum (pending → processing → completed | failed)
-- - 1 linha por unidade processada
-- - escrita só via service_role (frontend NUNCA escreve direto)
-- - SELECT scoped por company_id pra multi-tenancy
--
-- Idempotente. Rode no Supabase Studio → SQL Editor.
-- =========================================================================

BEGIN;

-- ─── 1) ENUM ────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrichment_job_status_enum') THEN
        CREATE TYPE enrichment_job_status_enum AS ENUM (
            'pending',      -- na fila, aguardando worker
            'processing',   -- worker pegou esse job
            'completed',    -- terminou com sucesso (achou email ou cache hit)
            'failed'        -- worker levantou exception ou orchestrator deu erro
        );
    END IF;
END$$;


-- ─── 2) Tabela ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL,                                          -- agrupa jobs da mesma request
    lead_id         UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    status          enrichment_job_status_enum NOT NULL DEFAULT 'pending',

    -- Resultado (preenchido quando status='completed')
    result_email           TEXT          NULL,
    result_source          TEXT          NULL,
    result_confidence      NUMERIC(3,2)  NULL,
    result_cached          BOOLEAN       NOT NULL DEFAULT false,
    result_cost_usd        NUMERIC(10,4) NOT NULL DEFAULT 0,
    result_extracted_cnpjs JSONB         NULL,   -- array de CNPJs validados achados durante scrape

    -- Erro (preenchido quando status='failed')
    error           TEXT NULL,

    started_at      TIMESTAMPTZ NULL,
    completed_at    TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pra worker: pega jobs pending de um batch em ordem FIFO
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_batch_status
    ON public.enrichment_jobs (batch_id, status, created_at);

-- Index pra GET /status/{batch_id} (agregação rápida)
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_batch_id
    ON public.enrichment_jobs (batch_id);

-- Index pra listagens "meus batches recentes" no PR 6 (history)
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_company_created
    ON public.enrichment_jobs (company_id, created_at DESC);


-- ─── 3) RLS ─────────────────────────────────────────────────────────────────
-- Mesmo padrão das tabelas existentes (clean_v1, v4):
-- - SELECT: company_id do usuário OR is_super_admin
-- - INSERT/UPDATE/DELETE: NENHUMA policy pra authenticated → escrita só
--   por service_role (worker e endpoints do backend).

ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enrichment_jobs_select_company_scoped"
    ON public.enrichment_jobs;

CREATE POLICY "enrichment_jobs_select_company_scoped"
    ON public.enrichment_jobs
    FOR SELECT
    TO authenticated
    USING (
        company_id = public.user_company_id()
        OR public.is_super_admin()
    );

-- Sem policy de INSERT/UPDATE/DELETE pra `authenticated` = default deny.
-- service_role bypassa RLS por design.

COMMENT ON TABLE public.enrichment_jobs IS
    'Jobs de enrichment de email (PR 5). 1 linha por lead dentro de um batch. Worker single-process via BackgroundTasks (TECH_DEBT.md#3).';
COMMENT ON COLUMN public.enrichment_jobs.batch_id IS
    'UUID compartilhado entre N jobs da mesma request POST /enrich-emails/async. Usado pelo GET /enrich-emails/status/{batch_id}.';
COMMENT ON COLUMN public.enrichment_jobs.result_extracted_cnpjs IS
    'Array JSONB de CNPJs (14 dígitos sem máscara) extraídos no scrape. Orchestrator persiste o 1º em leads.cnpj se não setado.';

COMMIT;
