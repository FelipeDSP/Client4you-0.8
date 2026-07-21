-- =========================================================================
-- MIGRATION v15 — Coordenadas (lat/lng) em leads (mini-mapa por lead)
-- =========================================================================
-- Persiste a coordenada geográfica de cada negócio, que as fontes de descoberta
-- (DataForSEO / Scrappa) já retornam e a gente descartava. Alimenta o pin de
-- cada lead no mini-mapa da aba Buscar Leads.
--
-- Campo por fonte (nome REAL do JSON — ver _normalize_item de cada service):
--   - Scrappa  → item.latitude / item.longitude   (VERIFICADO por chamada real,
--                 smoke_test_scrappa em "restaurante"/"Ariquemes RO", 2026-07-21)
--   - DataForSEO → item.latitude / item.longitude  (schema oficial Google Maps
--                 live/advanced — smoke-testar quando a conta destravar)
--
-- double precision (WGS84 graus decimais). NULL quando a fonte não trouxe coord
-- ou pra leads antigos — o mapa cai no geocode da região nesse caso.
--
-- Aditivo, nullable, reversível (DROP COLUMN). Idempotente.
-- Rode no Supabase Studio → SQL Editor.
-- =========================================================================

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION NULL,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NULL;

COMMENT ON COLUMN public.leads.latitude IS
    'Latitude WGS84 (graus decimais) do negócio, direto da fonte de descoberta. NULL = fonte não trouxe / lead antigo.';
COMMENT ON COLUMN public.leads.longitude IS
    'Longitude WGS84 (graus decimais) do negócio, direto da fonte de descoberta. NULL = fonte não trouxe / lead antigo.';
