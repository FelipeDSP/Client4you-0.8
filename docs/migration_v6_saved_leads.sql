-- =========================================================================================
-- MIGRATION v6 — Base de Leads (saved_at) + auto-prune de buscas antigas
-- =========================================================================================
-- Separa leads "resultados de busca transitórios" (saved_at IS NULL) de
-- leads "salvos na Base de Leads" (saved_at preenchido).
--
-- Rode no Supabase Studio → SQL Editor.
-- =========================================================================================

-- 1) Adiciona coluna saved_at em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ NULL;

-- 2) Backfill: marca leads JÁ EXISTENTES como salvos para não esvaziar a base atual.
--    Novos leads vindos da Edge Function search-leads terão saved_at NULL por padrão.
UPDATE public.leads SET saved_at = created_at WHERE saved_at IS NULL;

-- 3) Index pra Base de Leads (filtra por company_id + saved_at IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_leads_company_saved
  ON public.leads(company_id, saved_at)
  WHERE saved_at IS NOT NULL;

-- 4) Permite deletar search_history sem quebrar leads salvos
--    (FK passa a SET NULL: search_id vira null nos leads).
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_search_id_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_search_id_fkey
  FOREIGN KEY (search_id) REFERENCES public.search_history(id) ON DELETE SET NULL;

-- 5) Função de prune (apaga leads de busca não salvos + histórico antigo)
CREATE OR REPLACE FUNCTION public.prune_old_search_data(days_to_keep INT DEFAULT 30)
RETURNS TABLE(deleted_leads BIGINT, deleted_history BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff TIMESTAMPTZ;
  d_leads BIGINT;
  d_hist BIGINT;
BEGIN
  cutoff := NOW() - (days_to_keep || ' days')::INTERVAL;

  -- Apaga leads de busca não salvos pelo usuário
  WITH del AS (
    DELETE FROM public.leads
    WHERE saved_at IS NULL AND created_at < cutoff
    RETURNING 1
  )
  SELECT count(*) INTO d_leads FROM del;

  -- Apaga histórico antigo (saved leads sobrevivem via ON DELETE SET NULL)
  WITH del AS (
    DELETE FROM public.search_history
    WHERE created_at < cutoff
    RETURNING 1
  )
  SELECT count(*) INTO d_hist FROM del;

  RETURN QUERY SELECT d_leads, d_hist;
END;
$$;

-- 6) [OPCIONAL] Agendar limpeza diária às 3h da manhã via pg_cron
--    a) Vá em: Database → Extensions → habilite "pg_cron"
--    b) Rode (uma vez):
-- SELECT cron.schedule(
--   'prune-old-search-data-daily',
--   '0 3 * * *',
--   $$SELECT public.prune_old_search_data(30);$$
-- );

-- Rodar manualmente agora:
-- SELECT * FROM public.prune_old_search_data(30);
