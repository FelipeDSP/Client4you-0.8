-- =========================================================================
-- MIGRATION v14 — RPC `increment_quota_atomic` (auditoria pós-PR 6)
-- =========================================================================
-- Resolve achado P0 #1 da auditoria: `backend/supabase_service.py:301`
-- chamava `client.rpc('increment_quota_atomic', ...)` que NUNCA foi criada
-- em migration anterior. Resultado: TODA chamada caía no fallback
-- read-then-write em Python — race condition em todos os contadores
-- (leads_used, emails_enriched_used, reenrich_used, etc).
--
-- Esta migration cria a função pra valer. Atomicidade vem do UPDATE direto
-- no Postgres: 2 workers concorrentes resultam em soma correta.
--
-- Segurança:
--  - SECURITY DEFINER pra dar acesso a user_quotas mesmo de chamadores
--    com RLS restritiva (worker usa service_role, mas defesa-em-profundidade).
--  - SET search_path = public, pg_temp (mesmo padrão das helpers de v1) —
--    impede search-path injection (também era achado P0 #6 em outro contexto).
--  - WHITELIST explícita de campos válidos. EXECUTE format() com identifier
--    arbitrário é SQL injection na veia; o IF dentro da função restringe.
--
-- Idempotente (CREATE OR REPLACE). Rode no Supabase Studio → SQL Editor.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.increment_quota_atomic(
    p_user_id uuid,
    p_field   text,
    p_amount  numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Whitelist: campos numéricos válidos pra incremento atômico.
    -- Qualquer outro nome de campo levanta exceção (não executa UPDATE).
    IF p_field NOT IN (
        -- Contadores INT existentes pré-PR 4
        'leads_used',
        'campaigns_used',
        'messages_sent',
        -- Contadores INT introduzidos no PR 4a (migration v10)
        'emails_enriched_used',
        'cache_hits_count',
        -- Contador NUMERIC introduzido no PR 4a (migration v10)
        'firecrawl_credits_spent_estimated',
        -- Contador INT introduzido no PR 6 (migration v13)
        'reenrich_used'
    ) THEN
        RAISE EXCEPTION 'increment_quota_atomic: campo invalido %', p_field
            USING HINT = 'Adicione na whitelist da função antes de usar';
    END IF;

    -- UPDATE atômico via format() — campo identificador (não string).
    -- O parametrizador $1 trata p_user_id e $2 trata p_amount como dados,
    -- imunes a injeção. p_field foi validado acima.
    EXECUTE format(
        'UPDATE public.user_quotas
            SET %1$I = %1$I + $2,
                updated_at = NOW()
          WHERE user_id = $1',
        p_field
    ) USING p_user_id, p_amount;

    -- Não retorna nada. Se a row não existe, UPDATE é no-op silencioso
    -- (mantém comportamento atual do código Python).
END;
$$;

COMMENT ON FUNCTION public.increment_quota_atomic(uuid, text, numeric) IS
    'Increment atômico de contadores em user_quotas. Whitelist de campos. SECURITY DEFINER pra service_role bypassar RLS. Usado por supabase_service.increment_quota e services/email_enrichment/persistence.';

-- Permissões: service_role já tem acesso por SECURITY DEFINER + função owned
-- pelo postgres. authenticated/anon NÃO precisam — incremento é só backend.
-- Garantir explicitamente:
REVOKE ALL ON FUNCTION public.increment_quota_atomic(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_quota_atomic(uuid, text, numeric) TO service_role;
