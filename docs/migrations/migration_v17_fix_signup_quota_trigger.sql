-- migration_v17_fix_signup_quota_trigger.sql
-- Corrige o erro "Database error creating new user" na criação de qualquer
-- usuário novo (signup e painel admin).
--
-- CAUSA: o trigger `handle_new_user_quota` inseria em public.user_quotas as
-- colunas plan_type, plan_name, plan_expires_at — que foram REMOVIDAS na
-- refatoração de plano (o plano virou linha em `subscriptions`; os limites vêm
-- do PLAN_LIMITS no código). Como as colunas não existem mais, o INSERT falhava
-- e derrubava (rollback) o INSERT em auth.users → "Database error creating new
-- user". Usuários antigos foram criados antes da refatoração, por isso só
-- cadastros NOVOS quebravam.
--
-- FIX: a linha de user_quotas passa a ser criada DENTRO de handle_new_user (que
-- já tem o company_id da empresa recém-criada — necessário porque
-- get_user_quota_with_plan resolve o plano por user_quotas.company_id), usando
-- só colunas que existem (o resto tem default). O trigger/função
-- handle_new_user_quota, obsoleto, é removido.
--
-- Rode no Supabase (SQL Editor). Idempotente.

BEGIN;

-- 1) handle_new_user agora também cria a quota (com company_id), sem colunas mortas.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_company_id UUID;
BEGIN
  -- Empresa do novo usuário
  INSERT INTO public.companies (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.id::text
  )
  RETURNING id INTO new_company_id;

  -- Perfil
  INSERT INTO public.profiles (id, email, full_name, company_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    new_company_id
  );

  -- Role de company_owner
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (NEW.id, 'company_owner', new_company_id);

  -- Assinatura demo (fonte do plano)
  INSERT INTO public.subscriptions (company_id, plan_id, status)
  VALUES (new_company_id, 'demo', 'active');

  -- Quota: SÓ contadores. Limites vêm de subscriptions/PLAN_LIMITS.
  -- company_id é obrigatório aqui pra resolver o plano depois.
  INSERT INTO public.user_quotas (user_id, company_id)
  VALUES (NEW.id, new_company_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 2) Remove o trigger quebrado (por qualquer nome, em qualquer tabela) + a função.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tgname, tgrelid::regclass AS tbl
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND pg_get_triggerdef(oid) ILIKE '%handle_new_user_quota%'
  LOOP
    EXECUTE format('DROP TRIGGER %I ON %s', t.tgname, t.tbl);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.handle_new_user_quota();

COMMIT;
