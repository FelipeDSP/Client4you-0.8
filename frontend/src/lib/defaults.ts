import { CompanySettings } from "@/hooks/useCompanySettings";

// Defaults para company_settings — apenas campos persistidos para a empresa.
// As configurações de intervalo/horário do Disparador são por campanha
// e estão definidas em CAMPAIGN_DEFAULTS dentro de CreateCampaignDialog.tsx.
export const COMPANY_SETTINGS_DEFAULTS: Partial<CompanySettings> = {
  remarketingEnabled: false,
  remarketingDelayDays: 5,
  remarketingDailyLimit: 50,
  remarketingTime: '09:00',
  remarketingIntervalMin: 120,
  remarketingIntervalMax: 300,
  remarketingMessage: 'Olá {nome}! Vi que conversamos recentemente mas não conseguimos dar continuidade. Posso te ajudar com algo?',
  agentEnabled: false,
  agentName: 'Assistente Virtual',
  agentTone: 'professional',
  agentPersonality: 'Sou um assistente virtual prestativo e profissional.',
  agentSystemPrompt: `Você é um assistente virtual de atendimento ao cliente.

Suas principais responsabilidades:
- Responder dúvidas sobre produtos e serviços
- Qualificar leads interessados
- Agendar reuniões quando solicitado
- Direcionar para atendimento humano quando necessário

Regras importantes:
- Seja sempre cordial e profissional
- Não invente informações que não possui
- Colete nome, email e telefone quando apropriado
- Pergunte como pode ajudar se a mensagem for vaga`,
  agentWelcomeMessage: 'Olá! 👋 Sou o assistente virtual da empresa. Como posso ajudar você hoje?',
  agentResponseDelay: 3,
  agentMaxResponseLength: 500,
  agentWorkingHoursEnabled: false,
  agentWorkingHoursStart: '09:00',
  agentWorkingHoursEnd: '18:00',
  agentAutoQualify: true,
  agentQualificationQuestions: ['Qual é o seu nome?', 'Qual é o seu email para contato?', 'Como conheceu nossa empresa?'],
  agentBlockedTopics: [],
};

// Mapeamento camelCase → snake_case para persistência no Supabase.
// Não contém os campos de defaults do disparador — esses são por campanha.
export const COMPANY_SETTINGS_FIELD_MAP: Record<string, string> = {
  serpapiKey: 'serpapi_key',
  wahaApiUrl: 'waha_api_url',
  wahaApiKey: 'waha_api_key',
  wahaSession: 'waha_session',
  remarketingEnabled: 'remarketing_enabled',
  remarketingDelayDays: 'remarketing_delay_days',
  remarketingDailyLimit: 'remarketing_daily_limit',
  remarketingTime: 'remarketing_time',
  remarketingIntervalMin: 'remarketing_interval_min',
  remarketingIntervalMax: 'remarketing_interval_max',
  remarketingMessage: 'remarketing_message',
  agentEnabled: 'agent_enabled',
  agentName: 'agent_name',
  agentTone: 'agent_tone',
  agentPersonality: 'agent_personality',
  agentSystemPrompt: 'agent_system_prompt',
  agentWelcomeMessage: 'agent_welcome_message',
  agentResponseDelay: 'agent_response_delay',
  agentMaxResponseLength: 'agent_max_response_length',
  agentWorkingHoursEnabled: 'agent_working_hours_enabled',
  agentWorkingHoursStart: 'agent_working_hours_start',
  agentWorkingHoursEnd: 'agent_working_hours_end',
  agentAutoQualify: 'agent_auto_qualify',
  agentQualificationQuestions: 'agent_qualification_questions',
  agentBlockedTopics: 'agent_blocked_topics',
};
