-- migration_v19_segment_folders.sql
-- Pastas (folders) que AGRUPAM segmentos na Base de Leads.
--
-- Contexto: os segmentos (lead_segments, v16) já funcionam como "listas" de
-- leads (N:N — um lead pode estar em vários). Faltava uma camada de organização
-- POR CIMA dos segmentos, no estilo Brevo/Mautic: pastas que agrupam segmentos.
--
-- Modelo: cada segmento mora dentro de UMA pasta (ou nenhuma = raiz).
-- Apagar a pasta NÃO apaga os segmentos — eles voltam pra raiz (folder_id NULL).
-- Escopo: EMPRESA (RLS company-scoped, igual ao v16).
--
-- Rode no Supabase (SQL Editor → cole → Run). Idempotente.

BEGIN;

-- ── Tabela: pastas de segmentos ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.segment_folders (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    color text,                                    -- hex ex '#FFAA00' (opcional)
    position integer NOT NULL DEFAULT 0,           -- ordem manual na sidebar
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT segment_folders_pkey PRIMARY KEY (id),
    CONSTRAINT segment_folders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    CONSTRAINT segment_folders_created_by_fkey  FOREIGN KEY (created_by) REFERENCES auth.users(id)      ON DELETE SET NULL
);

-- ── Coluna: em qual pasta o segmento está ───────────────────────────────────
ALTER TABLE public.lead_segments
    ADD COLUMN IF NOT EXISTS folder_id uuid;

-- FK adicionada à parte pra ser idempotente mesmo se a coluna já existir.
-- ON DELETE SET NULL: apagar a pasta SOLTA os segmentos (não os apaga).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_segments_folder_id_fkey') THEN
        ALTER TABLE public.lead_segments
            ADD CONSTRAINT lead_segments_folder_id_fkey
            FOREIGN KEY (folder_id) REFERENCES public.segment_folders(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_segment_folders_company_id ON public.segment_folders(company_id);
CREATE INDEX IF NOT EXISTS idx_lead_segments_folder_id    ON public.lead_segments(folder_id);

-- ── RLS (company-scoped, igual ao v16) ──────────────────────────────────────
ALTER TABLE public.segment_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "segment_folders_company_scoped" ON public.segment_folders;
CREATE POLICY "segment_folders_company_scoped" ON public.segment_folders
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

-- ── Comentários ─────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.segment_folders          IS 'Pastas que agrupam segmentos (lead_segments.folder_id). Escopo empresa (v19).';
COMMENT ON COLUMN public.lead_segments.folder_id  IS 'Pasta que agrupa este segmento (segment_folders). NULL = raiz/sem pasta. ON DELETE SET NULL: apagar a pasta solta os segmentos, não os apaga.';

COMMIT;
