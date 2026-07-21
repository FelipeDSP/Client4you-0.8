-- =========================================================================================
-- MIGRATION v5 — View necessária pro endpoint /api/admin/companies
-- =========================================================================================
-- Rode no Supabase Studio → SQL Editor.
-- Sem essa view, GET /api/admin/companies retorna 500 (PGRST200).
-- =========================================================================================

-- Drop antes do create para evitar conflito de tipo se a view já existir
DROP VIEW IF EXISTS public.company_member_counts;

CREATE VIEW public.company_member_counts AS
SELECT company_id, count(*) AS total_members
FROM public.profiles
GROUP BY company_id;

GRANT SELECT ON public.company_member_counts TO authenticated;
GRANT SELECT ON public.company_member_counts TO service_role;

-- Verificação rápida:
SELECT * FROM public.company_member_counts LIMIT 5;
