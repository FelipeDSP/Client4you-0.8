-- =========================================================================
-- MIGRATION v9 — domain_email_cache (refactor email enrichment PR 4)
-- =========================================================================
-- Cache GLOBAL (sem company_id) de email por domínio. Motivação: Firecrawl
-- não é PAYG, cobra fixo por mês e cobra de novo em re-scrapes da mesma URL.
-- Sem cache, todo re-enrichment paga de novo. Cache por DOMÍNIO permite que
-- 200 leads do McDonald's (de 50 clientes diferentes) compartilhem 1 único
-- scrape de mcdonalds.com.br.
--
-- Cache NEGATIVO também conta: se o scrape rodou e não achou email, INSERT
-- com email=NULL — evita re-scrapar o mesmo domínio sem-email todo mês.
--
-- Por ser tabela global em projeto multi-tenant, RLS é OBRIGATÓRIA:
-- - service_role: acesso total (backend usa esse role)
-- - authenticated/anon: ZERO acesso (default deny do RLS — sem policy)
--
-- O frontend NUNCA lê/escreve essa tabela diretamente. Toda interação passa
-- pelo backend (orchestrator).
--
-- Idempotente. Rode no Supabase Studio → SQL Editor.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.domain_email_cache (
    domain         TEXT PRIMARY KEY,
    email          TEXT NULL,                  -- NULL = "tentamos e não achamos"
    source         TEXT NULL,                  -- provider que achou (ou último que tentou)
    confidence     NUMERIC(3,2) NULL,          -- 0.00 a 1.00
    cost_usd       NUMERIC(10,4) NOT NULL DEFAULT 0,
    scraped_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index pra purge/expiry queries: "domínios scraped antes de X"
CREATE INDEX IF NOT EXISTS idx_domain_email_cache_scraped_at
    ON public.domain_email_cache (scraped_at);

-- =========================================================================
-- RLS — defense in depth pra tabela global
-- =========================================================================
-- ENABLE em vez de FORCE: service_role bypassa por design no Supabase,
-- mas authenticated/anon ficam bloqueados sem policy (default deny).

ALTER TABLE public.domain_email_cache ENABLE ROW LEVEL SECURITY;

-- service_role: acesso total. Drop antes pra ser idempotente.
DROP POLICY IF EXISTS "domain_email_cache_service_role_all"
    ON public.domain_email_cache;

CREATE POLICY "domain_email_cache_service_role_all"
    ON public.domain_email_cache
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- INTENCIONALMENTE sem policies pra `authenticated` ou `anon`.
-- Sem policy = sem acesso (default deny do RLS). Se algum JWT tentar
-- SELECT/INSERT/UPDATE/DELETE via PostgREST, recebe vazio/erro.

COMMENT ON TABLE public.domain_email_cache IS
    'Cache global de email por domínio. RLS bloqueia tudo exceto service_role. Backend-only.';
COMMENT ON COLUMN public.domain_email_cache.email IS
    'NULL = scrape rodou mas não achou email. Evita re-scrape periódico do mesmo domínio.';
