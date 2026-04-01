-- =============================================================
-- Migration: Expansão da tabela company_settings
-- Novos campos para configuração de Disparador e Remarketing
-- Executar no painel SQL do Supabase
-- =============================================================

-- 1. Defaults do Disparador
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS default_interval_min INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS default_interval_max INTEGER DEFAULT 180,
ADD COLUMN IF NOT EXISTS default_daily_limit INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS default_start_time TEXT DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS default_end_time TEXT DEFAULT '18:00';

-- 2. Configurações do Remarketing
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS remarketing_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS remarketing_delay_days INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS remarketing_daily_limit INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS remarketing_time TEXT DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS remarketing_interval_min INTEGER DEFAULT 120,
ADD COLUMN IF NOT EXISTS remarketing_interval_max INTEGER DEFAULT 300,
ADD COLUMN IF NOT EXISTS remarketing_message TEXT DEFAULT 'Olá {nome}! Vi que conversamos recentemente mas não conseguimos dar continuidade. Posso te ajudar com algo?';

-- 3. Configurações do Agente IA (migrar de localStorage para banco)
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS agent_name TEXT DEFAULT 'Assistente Virtual',
ADD COLUMN IF NOT EXISTS agent_tone TEXT DEFAULT 'professional',
ADD COLUMN IF NOT EXISTS agent_personality TEXT DEFAULT 'Sou um assistente virtual prestativo e profissional.',
ADD COLUMN IF NOT EXISTS agent_system_prompt TEXT,
ADD COLUMN IF NOT EXISTS agent_welcome_message TEXT DEFAULT 'Olá! 👋 Sou o assistente virtual da empresa. Como posso ajudar você hoje?',
ADD COLUMN IF NOT EXISTS agent_response_delay INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS agent_max_response_length INTEGER DEFAULT 500,
ADD COLUMN IF NOT EXISTS agent_working_hours_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS agent_working_hours_start TEXT DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS agent_working_hours_end TEXT DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS agent_auto_qualify BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS agent_qualification_questions TEXT[] DEFAULT ARRAY['Qual é o seu nome?', 'Qual é o seu email para contato?', 'Como conheceu nossa empresa?'],
ADD COLUMN IF NOT EXISTS agent_blocked_topics TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 4. Comentários nas colunas para documentação
COMMENT ON COLUMN company_settings.default_interval_min IS 'Intervalo mínimo padrão entre mensagens do disparador (segundos)';
COMMENT ON COLUMN company_settings.default_interval_max IS 'Intervalo máximo padrão entre mensagens do disparador (segundos)';
COMMENT ON COLUMN company_settings.default_daily_limit IS 'Limite diário padrão de envios do disparador';
COMMENT ON COLUMN company_settings.remarketing_enabled IS 'Se o remarketing automático está ativo';
COMMENT ON COLUMN company_settings.remarketing_delay_days IS 'Dias de espera antes de enviar remarketing';
COMMENT ON COLUMN company_settings.remarketing_daily_limit IS 'Máximo de mensagens de remarketing por dia';
COMMENT ON COLUMN company_settings.remarketing_time IS 'Horário de disparo do remarketing (HH:MM)';
COMMENT ON COLUMN company_settings.remarketing_interval_min IS 'Intervalo mínimo entre mensagens de remarketing (segundos)';
COMMENT ON COLUMN company_settings.remarketing_interval_max IS 'Intervalo máximo entre mensagens de remarketing (segundos)';
COMMENT ON COLUMN company_settings.remarketing_message IS 'Mensagem/template do remarketing. Suporta {nome}';
COMMENT ON COLUMN company_settings.agent_enabled IS 'Se o agente IA está ativo';
COMMENT ON COLUMN company_settings.agent_system_prompt IS 'Prompt de sistema enviado ao modelo de IA';
