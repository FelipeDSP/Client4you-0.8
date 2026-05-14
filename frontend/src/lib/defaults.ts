import { CompanySettings } from "@/hooks/useCompanySettings";

// =============================================================================
// COMPANY SETTINGS
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
