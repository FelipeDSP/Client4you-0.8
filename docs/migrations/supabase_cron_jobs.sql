-- =========================================================================================
-- AUTOMAÇÃO SUPABASE (CRON JOBS) - CLIENT4YOU
-- Objetivo: Agendar manutenção automática usando a extensão nativa pg_cron
-- =========================================================================================

-- 1. HABILITAR EXTENSÃO PG_CRON
-- -----------------------------------------------------------------------------------------
-- A extensão precisa estar habilitada no banco (geralmente por padrão em projetos Supabase).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. FUNÇÃO: Limpeza Diária de Lixo
-- -----------------------------------------------------------------------------------------
-- Esta função já foi criada no script anterior, mas estou recarregando caso necessário.
CREATE OR REPLACE FUNCTION clean_old_message_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Apaga logs de mensagens com mais de 30 dias
  DELETE FROM message_logs WHERE sent_at < NOW() - INTERVAL '30 days';
  
  -- Apaga notificações lidas há mais de 15 dias
  DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '15 days' AND read = TRUE;
  
  -- Apaga IPs da whitelist que estão desabilitados há muito tempo (opcional/limpeza de base)
  DELETE FROM ip_whitelist WHERE enabled = FALSE AND updated_at < NOW() - INTERVAL '90 days';
END;
$$;

-- 3. FUNÇÃO: Verificação Diária de Assinaturas (Quota/Planos)
-- -----------------------------------------------------------------------------------------
-- Esta função desativa automaticamente planos que venceram ontem (Fallback de segurança)
CREATE OR REPLACE FUNCTION expire_old_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Marca como 'expired' assinaturas que já passaram da validade e não foram renovadas
  UPDATE subscriptions 
  SET status = 'expired'
  WHERE current_period_end < NOW() AND status = 'active';
END;
$$;

-- 4. AGENDAMENTO DAS TAREFAS
-- -----------------------------------------------------------------------------------------
-- Agenda limpeza para rodar todo dia às 03:00 da manhã (Madrugada)
SELECT cron.schedule(
  'daily-cleanup', -- Nome do job
  '0 3 * * *',     -- Cron: Todo dia às 03:00 AM
  $$ SELECT clean_old_message_logs(); $$
);

-- Agenda verificação de assinaturas para rodar todo dia às 00:05 da manhã (Meia Noite)
SELECT cron.schedule(
  'daily-subscription-check', -- Nome do job
  '5 0 * * *',                -- Cron: Todo dia às 00:05 AM
  $$ SELECT expire_old_subscriptions(); $$
);

-- OBSERVAÇÕES:
-- Para ver os logs ou verificar se a tarefa rodou com sucesso, você pode acessar a tabela:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- Para ver todos os jobs agendados, acesse a tabela:
-- SELECT * FROM cron.job;
