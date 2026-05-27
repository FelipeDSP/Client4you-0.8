-- =========================================================================
-- MIGRATION v8 — Adiciona cnpj em leads (refactor email enrichment PR 3)
-- =========================================================================
-- Habilita o ReceitaFederalProvider: quando o lead tem CNPJ, consultamos
-- BrasilAPI (/api/cnpj/v1/{cnpj}) e pegamos o email oficial cadastrado na
-- Receita. Cobertura ~90% pra negócios formais brasileiros, custo $0.
--
-- CNPJ é populado de 3 formas:
-- 1. Passiva: regex no scrape Firecrawl/DataForSEOContactUrl extrai do
--    HTML (rodapé, contato). EmailResult.extracted_cnpjs carrega; o
--    orchestrator (PR 4) persiste aqui.
-- 2. Manual: endpoint POST /api/leads/{lead_id}/cnpj com validação DV.
-- 3. Futuro (TECH_DEBT.md#2): busca paga por razão social.
--
-- Armazenado SEM máscara (14 dígitos puros) — normalização feita no backend.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
--
-- Rode no Supabase Studio → SQL Editor.
-- =========================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cnpj TEXT NULL;

-- Index parcial — só leads COM cnpj. Útil pra:
-- - dashboards "leads com CNPJ" (cobertura ReceitaFederal)
-- - dedup futura por CNPJ (mesmo estabelecimento em buscas diferentes)
CREATE INDEX IF NOT EXISTS idx_leads_company_cnpj
  ON public.leads(company_id, cnpj)
  WHERE cnpj IS NOT NULL;
