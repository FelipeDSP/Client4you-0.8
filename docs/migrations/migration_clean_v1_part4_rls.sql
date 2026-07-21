-- =============================================================================
-- migration_clean_v1 — PARTE 4 de 4: RLS (Row Level Security)
-- =============================================================================
-- ATENÇÃO: esta parte DROPA TODAS as 72 policies atuais e recria 25 enxutas
-- usando funções helper. Mesmo nível de proteção, defense-in-depth por tabela.
-- =============================================================================

BEGIN;

-- ─── Helper functions (SECURITY DEFINER — evitam recursão de RLS) ───────────

CREATE OR REPLACE FUNCTION public.user_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    )
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('super_admin','company_owner')
    )
$$;

GRANT EXECUTE ON FUNCTION public.user_company_id()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_owner() TO authenticated;

-- ─── Habilitar RLS em todas as tabelas + dropar policies antigas ────────────

DO $$
DECLARE
    t text;
    pol record;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        FOR pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
        END LOOP;
    END LOOP;
END$$;

-- ─── Policies novas ─────────────────────────────────────────────────────────

CREATE POLICY "companies_select_own_or_admin" ON public.companies
    FOR SELECT TO authenticated
    USING (id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "companies_admin_all" ON public.companies
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "profiles_select_self_or_same_company" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR company_id = public.user_company_id()
        OR public.is_super_admin()
    );

CREATE POLICY "profiles_update_self" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_super_admin())
    WITH CHECK (id = auth.uid() OR public.is_super_admin());

CREATE POLICY "profiles_admin_all" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "user_roles_select_self" ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "user_roles_admin_write" ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "user_quotas_select_self_or_company_owner" ON public.user_quotas
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    );

CREATE POLICY "subscriptions_select_own_company" ON public.subscriptions
    FOR SELECT TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "subscriptions_admin_write" ON public.subscriptions
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "company_settings_select_own" ON public.company_settings
    FOR SELECT TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "company_settings_write_owner" ON public.company_settings
    FOR ALL TO authenticated
    USING (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    )
    WITH CHECK (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    );

CREATE POLICY "agent_configs_select_own" ON public.agent_configs
    FOR SELECT TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "agent_configs_write_owner" ON public.agent_configs
    FOR ALL TO authenticated
    USING (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    )
    WITH CHECK (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    );

CREATE POLICY "leads_company_scoped" ON public.leads
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "search_history_company_scoped" ON public.search_history
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "campaigns_company_scoped" ON public.campaigns
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "campaign_contacts_via_campaign" ON public.campaign_contacts
    FOR ALL TO authenticated
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE company_id = public.user_company_id()
        )
        OR public.is_super_admin()
    )
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE company_id = public.user_company_id()
        )
        OR public.is_super_admin()
    );

CREATE POLICY "message_logs_via_campaign" ON public.message_logs
    FOR SELECT TO authenticated
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE company_id = public.user_company_id()
        )
        OR public.is_super_admin()
    );

CREATE POLICY "notifications_own" ON public.notifications
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "bot_sessions_company_scoped" ON public.bot_sessions
    FOR ALL TO authenticated
    USING (company_id = public.user_company_id() OR public.is_super_admin())
    WITH CHECK (company_id = public.user_company_id() OR public.is_super_admin());

CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_super_admin());

CREATE POLICY "login_attempts_admin_read" ON public.login_attempts
    FOR SELECT TO authenticated
    USING (public.is_super_admin());

CREATE POLICY "ip_whitelist_company_scoped" ON public.ip_whitelist
    FOR ALL TO authenticated
    USING (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    )
    WITH CHECK (
        (company_id = public.user_company_id() AND public.is_company_owner())
        OR public.is_super_admin()
    );

CREATE POLICY "user_2fa_own" ON public.user_2fa
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- ─── Validação final ────────────────────────────────────────────────────────

DO $$
DECLARE
    rls_off_count INT;
    no_policy_count INT;
    policy_total INT;
BEGIN
    SELECT COUNT(*) INTO rls_off_count
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;

    SELECT COUNT(*) INTO no_policy_count
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
      AND (SELECT COUNT(*) FROM pg_policy p WHERE p.polrelid = c.oid) = 0;

    SELECT COUNT(*) INTO policy_total FROM pg_policies WHERE schemaname = 'public';

    RAISE NOTICE 'RLS desabilitada em: % tabela(s). Sem policy: %. Total de policies: %.',
        rls_off_count, no_policy_count, policy_total;
END$$;

COMMIT;
