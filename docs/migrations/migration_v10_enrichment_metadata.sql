-- =========================================================================
-- MIGRATION v10 — Enrichment metadata + quota telemetry
-- (refactor email enrichment PR 4a)
-- =========================================================================
-- Dois blocos:
--
-- (A) `leads`: metadata da tentativa de enrichment (quando, qual provider,
--     qual score). Permite ao frontend (PR 6) mostrar badges de fonte e
--     decidir se botão "Reenriquecer" deve aparecer baseado em recência.
--
-- (B) `user_quotas`: contadores de telemetria de enrichment. Sobem todo
--     enrichment, mas NÃO bloqueiam o usuário no PR 4 (limite mensal vem
--     no PR 6 quando a UI tiver o suporte). Servem pro dashboard interno de
--     "quanto estamos gastando em Firecrawl vs quanto cobramos do plano".
--
-- Idempotente. Rode no Supabase Studio → SQL Editor.
--
-- NOTA: campos populados pelo MetadataEnrichmentProvider (Receita Federal)
-- — razao_social, nome_fantasia, cnae, porte, situacao_cadastral, qsa —
-- vivem em `migration_v11_leads_receita_metadata.sql` (PR 4b).
-- =========================================================================

-- =========================================================================
-- (A) leads — enrichment attempt metadata
-- =========================================================================

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS last_enrichment_attempted_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS enrichment_source            TEXT         NULL,
    ADD COLUMN IF NOT EXISTS enrichment_confidence        NUMERIC(3,2) NULL;

-- Index pra queries "leads não enriquecidos OU enriquecidos há mais de 30d"
-- (suporte ao botão "Reenriquecer" do PR 6)
CREATE INDEX IF NOT EXISTS idx_leads_last_enrichment_attempted_at
    ON public.leads (company_id, last_enrichment_attempted_at);

COMMENT ON COLUMN public.leads.enrichment_source IS
    'Provider que achou o email: dataforseo_contact_url | firecrawl_search | firecrawl_map_scrape | cache_hit. NULL = nunca tentou.';

-- =========================================================================
-- (B) user_quotas — contadores de telemetria de enrichment
-- =========================================================================
-- Mesmo padrão dos contadores existentes (leads_used, campaigns_used,
-- messages_sent): INTEGER DEFAULT 0 NOT NULL.
--
-- emails_enriched_used: +1 por lead que entrou no orchestrator (cache hit OU miss).
--                       É a unidade que o usuário "compra" no plano.
-- firecrawl_credits_spent_estimated: soma de cost_usd real (cache hit = $0).
--                       Telemetria interna, não bloqueia.
-- cache_hits_count: quantas vezes o cache evitou Firecrawl.
--                       Telemetria interna, mede ROI do cache.

ALTER TABLE public.user_quotas
    ADD COLUMN IF NOT EXISTS emails_enriched_used              INTEGER       NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS firecrawl_credits_spent_estimated NUMERIC(10,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cache_hits_count                  INTEGER       NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_quotas.emails_enriched_used IS
    'Conta tentativas de enrichment de email no ciclo (cache hit ou miss). PR 4 só conta; bloqueio por limite vem no PR 6.';
COMMENT ON COLUMN public.user_quotas.firecrawl_credits_spent_estimated IS
    'Soma de cost_usd dos providers Firecrawl (cache hit = 0). Telemetria interna pra precificação.';
