-- =========================================================================
-- MIGRATION v7 — Adiciona contact_url em leads
-- =========================================================================
-- DataForSEO Google Maps retorna o campo `contact_url` em cada item — URL da
-- página de contato preferida que o estabelecimento cadastrou no GMB.
--
-- O DataForSEOContactUrlProvider (PR 2 do refactor de email enrichment) usa
-- esse campo como seed prioritária de scrape, evitando ter que chutar
-- /contato, /sobre, /about etc. Custo: $0 (já pago na busca DataForSEO).
--
-- Idempotente: usa IF NOT EXISTS. Seguro pra rodar em schema novo ou
-- existente.
--
-- Rode no Supabase Studio → SQL Editor.
-- =========================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_url TEXT NULL;

-- Sem index — `contact_url` não é critério de busca, só payload pro provider.
