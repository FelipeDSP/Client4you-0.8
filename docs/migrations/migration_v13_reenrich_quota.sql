-- =========================================================================
-- MIGRATION v13 — Sub-quota separada de reenriquecimento (PR 6)
-- =========================================================================
-- O botão "Reenriquecer" do plano intermediário+ FORÇA bypass do cache —
-- sempre gasta Firecrawl (mesmo se já tem entry no domain_email_cache).
-- Por ser o cenário MAIS CARO de enrichment, merece contador separado
-- (não diluído no `emails_enriched_used`), pra ser limitado agressivamente
-- e visível em telemetria.
--
-- Decisão registrada no spec do PR 6 + ADR-001 atualizado.
--
-- Idempotente. Rode no Supabase Studio → SQL Editor.
-- =========================================================================

ALTER TABLE public.user_quotas
    ADD COLUMN IF NOT EXISTS reenrich_used INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_quotas.reenrich_used IS
    'Contador separado de reenriquecimentos (force=true, bypass cache). Limite vem de plans.PLAN_LIMITS[plan_id]["reenrich_limit"]. Plano intermediário tem ~10/mês; demais planos têm 0.';
