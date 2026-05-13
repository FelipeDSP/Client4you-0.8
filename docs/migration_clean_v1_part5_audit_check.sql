-- =============================================================================
-- migration_clean_v1 — PARTE 5 (hotfix): dropar CHECK obsoleto em audit_logs
-- =============================================================================
-- O CHECK audit_logs_target_type_check restringia target_type a
-- ('user', 'company', 'quota', 'role', 'settings'). Mas o backend usa
-- target_type='system' para ações de listagem (view_users_list,
-- view_companies_list), o que disparava 400 do PostgREST e poluía os
-- logs com APIError, mesmo que a resposta da API continuasse 200.
--
-- Solução: dropar o CHECK. A validação fica do lado do app (no Pydantic
-- da rota) que é mais expressivo.
-- =============================================================================

BEGIN;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_target_type_check;

COMMIT;
