-- =========================================================================================
-- MIGRATION — Troca SerpAPI → DataForSEO + planos com limite real de leads
-- =========================================================================================
-- Contexto: a busca de leads saiu da Edge Function e foi pro backend FastAPI
-- (POST /api/leads/search), que chama o DataForSEO e aplica a QUOTA NO SERVIDOR.
-- As credenciais do DataForSEO ficam em env vars do BACKEND (não no banco):
--     DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
-- Os limites por plano vivem em backend/plans.py (não no banco).
--
-- Rode no Supabase Studio → SQL Editor.
-- =========================================================================================

-- 1) Reset do ciclo de uso de leads.
--    Os planos agora contam LEADS (não buscas) e os limites mudaram:
--      demo=50, básico=500, intermediário=2000.
--    Zera leads_used pra começar o novo ciclo de forma justa.
--    ATENÇÃO: zera o consumo de TODOS os usuários no meio do mês.
UPDATE public.user_quotas SET leads_used = 0;

-- 2) A coluna serpapi_key NÃO é mais usada (a chave agora é infra, no backend).
--    NÃO removemos agora — só depois de validar o DataForSEO em produção.
--    Quando estiver tudo ok, rode manualmente:
-- ALTER TABLE public.company_settings DROP COLUMN IF EXISTS serpapi_key;

-- 3) (Opcional) limpeza de leads transitórios antigos.
--    Os leads de busca entram com saved_at = NULL (ver migration_v6_saved_leads.sql).
--    Se já habilitou o prune lá, nada a fazer aqui.

-- =========================================================================================
-- Nada mais é necessário no banco para esta migração.
-- A Edge Function `search-leads` deixou de ser chamada pelo frontend e pode ser
-- removida do Supabase quando você quiser (Dashboard → Edge Functions).
-- =========================================================================================
