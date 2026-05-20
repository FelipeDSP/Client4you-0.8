import { CompanySettings } from "@/hooks/useCompanySettings";

// =============================================================================
// COMPANY SETTINGS
// =============================================================================
// Defaults para company_settings — apenas campos persistidos para a empresa.
// As configurações de intervalo/horário do Disparador são por campanha
// e estão definidas em CAMPAIGN_DEFAULTS dentro de CreateCampaignDialog.tsx.
export const COMPANY_SETTINGS_DEFAULTS: Partial<CompanySettings> = {};

// Mapeamento camelCase → snake_case para persistência no Supabase.
// A busca de leads passou a ser gerenciada como infraestrutura (DataForSEO via
// env vars no backend), então não há mais chave de API por empresa pra salvar.
export const COMPANY_SETTINGS_FIELD_MAP: Record<string, string> = {};
