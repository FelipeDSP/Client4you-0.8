import { CompanySettings } from "@/hooks/useCompanySettings";

// =============================================================================
// COMPANY SETTINGS (sem agent_* — movidos para agent_configs após migration v1)
// =============================================================================
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
};

// Mapeamento camelCase → snake_case para persistência no Supabase.
// Os campos agent_* foram removidos (estão em agent_configs agora).
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
};

// =============================================================================
// AGENT CONFIG (nova tabela canônica agent_configs)
// =============================================================================

const DEFAULT_SYSTEM_PROMPT = `Você é um assistente virtual de atendimento ao cliente.

Suas principais responsabilidades:
- Responder dúvidas sobre produtos e serviços
- Qualificar leads interessados
- Agendar reuniões quando solicitado
- Direcionar para atendimento humano quando necessário

Regras importantes:
- Seja sempre cordial e profissional
- Não invente informações que não possui
- Colete nome, email e telefone quando apropriado
- Pergunte como pode ajudar se a mensagem for vaga`;

export const AGENT_CONFIG_DEFAULTS = {
  enabled: false,
  name: 'Assistente Virtual',
  tone: 'professional' as 'formal' | 'casual' | 'professional' | 'friendly',
  personality: 'Sou um assistente virtual prestativo e profissional.',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  welcomeMessage: 'Olá! 👋 Sou o assistente virtual da empresa. Como posso ajudar você hoje?',
  responseDelay: 3,
  maxResponseLength: 500,
  autoQualify: true,
  qualificationQuestions: [
    'Qual é o seu nome?',
    'Qual é o seu email para contato?',
    'Como conheceu nossa empresa?',
  ] as string[],
  blockedTopics: [] as string[],
  workingHours: {
    enabled: false,
    start: '09:00',
    end: '18:00',
  },
  language: 'pt-BR',
  model: 'gpt-4o-mini',
  temperature: 0.7,
};
