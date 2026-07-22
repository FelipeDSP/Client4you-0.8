-- migration_v16_segments_tags.sql
-- Segmentos (pastas) + Etiquetas (tags) para a Base de Leads.
--
-- Modelo N:N: um lead pode estar em VÁRIOS segmentos e ter VÁRIAS etiquetas;
-- etiquetas também podem ser aplicadas a segmentos.
-- Escopo: EMPRESA (todos os membros compartilham) — RLS igual à tabela leads.
--
-- Rode no Supabase (SQL Editor → cole → Run). Idempotente (IF NOT EXISTS +
-- DROP POLICY IF EXISTS), então pode rodar de novo sem quebrar.

BEGIN;

-- ── Tabelas ────────────────────────────────────────────────────────────────

-- Segmentos = "pastas" onde o usuário organiza os leads.
CREATE TABLE IF NOT EXISTS public.lead_segments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    color text,                                    -- hex ex '#FFAA00' (opcional)
    description text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_segments_pkey PRIMARY KEY (id),
    CONSTRAINT lead_segments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    CONSTRAINT lead_segments_created_by_fkey  FOREIGN KEY (created_by) REFERENCES auth.users(id)      ON DELETE SET NULL
);

-- Etiquetas = rótulos coloridos aplicáveis a leads e a segmentos.
CREATE TABLE IF NOT EXISTS public.tags (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
    color text NOT NULL DEFAULT '#64748b',         -- slate-500
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tags_pkey PRIMARY KEY (id),
    CONSTRAINT tags_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    CONSTRAINT tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)      ON DELETE SET NULL
);
-- Nome de etiqueta único por empresa (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_company_name ON public.tags(company_id, lower(name));

-- Junção lead ↔ segmento (N:N). company_id denormalizado pra RLS simples.
CREATE TABLE IF NOT EXISTS public.lead_segment_members (
    segment_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    company_id uuid NOT NULL,
    added_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_segment_members_pkey PRIMARY KEY (segment_id, lead_id),
    CONSTRAINT lsm_segment_fkey FOREIGN KEY (segment_id) REFERENCES public.lead_segments(id) ON DELETE CASCADE,
    CONSTRAINT lsm_lead_fkey    FOREIGN KEY (lead_id)    REFERENCES public.leads(id)         ON DELETE CASCADE,
    CONSTRAINT lsm_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)     ON DELETE CASCADE
);

-- Junção lead ↔ etiqueta (N:N).
CREATE TABLE IF NOT EXISTS public.lead_tags (
    tag_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    company_id uuid NOT NULL,
    added_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_tags_pkey PRIMARY KEY (tag_id, lead_id),
    CONSTRAINT lead_tags_tag_fkey     FOREIGN KEY (tag_id)     REFERENCES public.tags(id)      ON DELETE CASCADE,
    CONSTRAINT lead_tags_lead_fkey    FOREIGN KEY (lead_id)    REFERENCES public.leads(id)     ON DELETE CASCADE,
    CONSTRAINT lead_tags_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE
);

-- Junção segmento ↔ etiqueta (N:N).
CREATE TABLE IF NOT EXISTS public.segment_tags (
    tag_id uuid NOT NULL,
    segment_id uuid NOT NULL,
    company_id uuid NOT NULL,
    added_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT segment_tags_pkey PRIMARY KEY (tag_id, segment_id),
    CONSTRAINT segment_tags_tag_fkey     FOREIGN KEY (tag_id)     REFERENCES public.tags(id)          ON DELETE CASCADE,
    CONSTRAINT segment_tags_segment_fkey FOREIGN KEY (segment_id) REFERENCES public.lead_segments(id) ON DELETE CASCADE,
    CONSTRAINT segment_tags_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)     ON DELETE CASCADE
);

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lead_segments_company_id ON public.lead_segments(company_id);
CREATE INDEX IF NOT EXISTS idx_tags_company_id          ON public.tags(company_id);
CREATE INDEX IF NOT EXISTS idx_lsm_company_id           ON public.lead_segment_members(company_id);
CREATE INDEX IF NOT EXISTS idx_lsm_lead_id              ON public.lead_segment_members(lead_id);
CREATE INDEX IF NOT EXISTS idx_lsm_segment_id           ON public.lead_segment_members(segment_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_company_id     ON public.lead_tags(company_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_id        ON public.lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag_id         ON public.lead_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_segment_tags_company_id  ON public.segment_tags(company_id);
CREATE INDEX IF NOT EXISTS idx_segment_tags_segment_id  ON public.segment_tags(segment_id);

-- ── RLS (company-scoped, igual à leads) ─────────────────────────────────────
ALTER TABLE public.lead_segments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_segment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_tags         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_segments_company_scoped" ON public.lead_segments;
CREATE POLICY "lead_segments_company_scoped" ON public.lead_segments
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "tags_company_scoped" ON public.tags;
CREATE POLICY "tags_company_scoped" ON public.tags
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "lead_segment_members_company_scoped" ON public.lead_segment_members;
CREATE POLICY "lead_segment_members_company_scoped" ON public.lead_segment_members
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "lead_tags_company_scoped" ON public.lead_tags;
CREATE POLICY "lead_tags_company_scoped" ON public.lead_tags
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "segment_tags_company_scoped" ON public.segment_tags;
CREATE POLICY "segment_tags_company_scoped" ON public.segment_tags
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

COMMIT;
