-- =========================================================================
-- MIGRATION v11 — Receita Federal metadata em leads (PR 4b)
-- =========================================================================
-- Campos populados pelo ReceitaFederalMetadataProvider (BrasilAPI
-- /api/cnpj/v1/{cnpj}) — pipeline assíncrono separado do email enrichment.
--
-- Histórico (registrado em docs/ADR-001-fontes-de-dados.md):
-- - PR 3 plantou o ReceitaFederalProvider como fonte de EMAIL com floor 0.6.
-- - Validação real (12 empresas BR) mostrou email=None em ~100% (LGPD).
-- - PR 4b rebaixou o provider de email → metadata. Email passou pra cascata
--   Firecrawl. Receita virou enriquecimento de qualificação.
--
-- QSA como JSONB porque cada CNPJ pode ter N sócios:
--   [{"nome_socio": "JOAO DA SILVA", "qualificacao_socio": "Administrador"}, ...]
--
-- Idempotente. Rode no Supabase Studio → SQL Editor.
-- =========================================================================

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS razao_social         TEXT        NULL,
    ADD COLUMN IF NOT EXISTS nome_fantasia        TEXT        NULL,
    ADD COLUMN IF NOT EXISTS cnae                 TEXT        NULL,
    ADD COLUMN IF NOT EXISTS porte                TEXT        NULL,
    ADD COLUMN IF NOT EXISTS situacao_cadastral   TEXT        NULL,
    ADD COLUMN IF NOT EXISTS qsa                  JSONB       NULL,
    ADD COLUMN IF NOT EXISTS metadata_enriched_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.leads.qsa IS
    'Quadro Social Administrativo da Receita (JSONB array). Cada item: {nome_socio, qualificacao_socio, ...}. Ouro pra prospecção (saber com quem falar).';
COMMENT ON COLUMN public.leads.metadata_enriched_at IS
    'Quando metadata (Receita) foi populada pela última vez. Distinto de last_enrichment_attempted_at (email).';
