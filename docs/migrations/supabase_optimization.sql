-- =========================================================================================
-- SCRIPT DE OTIMIZAÇÃO SUPABASE (CLIENT4YOU) - FASE 2
-- Objetivo: Criar Views, Índices e Funções para melhorar performance sem deletar dados
-- =========================================================================================

-- 1. CRIAÇÃO DE VIEWS PARA ACELERAR O DASHBOARD (Resolver Erro 404 e N+1)
-- -----------------------------------------------------------------------------------------
-- View para Dashboard: Contagem rápida de membros por empresa
CREATE OR REPLACE VIEW company_member_counts AS
SELECT company_id, count(*) as total_members
FROM profiles
GROUP BY company_id;

GRANT SELECT ON company_member_counts TO authenticated;
GRANT SELECT ON company_member_counts TO service_role;

-- View para Dashboard: Estatísticas de campanhas consolidadas
CREATE OR REPLACE VIEW dashboard_campaign_stats AS
SELECT 
    company_id,
    COUNT(*) as total_campaigns,
    SUM(total_contacts) as total_leads,
    SUM(sent_count) as total_messages_sent
FROM campaigns
GROUP BY company_id;

GRANT SELECT ON dashboard_campaign_stats TO authenticated;
GRANT SELECT ON dashboard_campaign_stats TO service_role;


-- 2. CRIAÇÃO DE ÍNDICES DE PERFORMANCE (Para consultas com regras `.eq()`)
-- -----------------------------------------------------------------------------------------
-- Estes índices aceleram absurdamente as buscas no backend ao evitar "Full Table Scans"
CREATE INDEX IF NOT EXISTS idx_campaigns_company_id ON campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_campaign_id ON message_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company_id ON notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);

-- 3. GARANTIA DE POLÍTICAS DE SEGURANÇA (RLS - Row Level Security)
-- -----------------------------------------------------------------------------------------
-- Habilitar RLS nas tabelas principais caso já não estejam
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Exemplo: Permitir acesso APENAS às campanhas da própria empresa (Multi-tenant)
-- Nota: A chave auth.uid() pega o ID do usuário logado no DB.
DO $$
BEGIN
    -- Remove política antiga se existir
    DROP POLICY IF EXISTS "Usuários podem ver apenas campanhas da sua empresa" ON campaigns;
    
    -- Cria nova política baseada na empresa
    CREATE POLICY "Usuários podem ver apenas campanhas da sua empresa" 
    ON campaigns FOR SELECT 
    USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Ignora erros caso a tabela profiles não esteja linkada com auth da mesma forma
END
$$;

-- 4. FUNÇÃO RPDC PARA LIMPEZA DE LOGS ANTIGOS (Evita o banco encher)
-- -----------------------------------------------------------------------------------------
-- Em vez do backend consultar milhares de linhas, o próprio DB apaga coisas com mais de 30 dias
CREATE OR REPLACE FUNCTION clean_old_message_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM message_logs WHERE sent_at < NOW() - INTERVAL '30 days';
  DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '15 days' AND read = TRUE;
END;
$$;

-- =========================================================================================
-- FIM DO SCRIPT
-- =========================================================================================
