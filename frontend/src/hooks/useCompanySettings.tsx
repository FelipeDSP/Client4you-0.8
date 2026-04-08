import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_SETTINGS_DEFAULTS, COMPANY_SETTINGS_FIELD_MAP } from "@/lib/defaults";

export interface CompanySettings {
  id: string;
  companyId: string;
  // Integrações
  serpapiKey: string | null;
  wahaApiUrl: string | null;
  wahaApiKey: string | null;
  wahaSession: string | null;
  // Geral
  timezone: string;
  // Remarketing
  remarketingEnabled: boolean;
  remarketingDelayDays: number;
  remarketingDailyLimit: number;
  remarketingTime: string;
  remarketingIntervalMin: number;
  remarketingIntervalMax: number;
  remarketingMessage: string;
  // Agente IA
  agentEnabled: boolean;
  agentName: string;
  agentTone: 'formal' | 'casual' | 'professional' | 'friendly';
  agentPersonality: string;
  agentSystemPrompt: string;
  agentWelcomeMessage: string;
  agentResponseDelay: number;
  agentMaxResponseLength: number;
  agentWorkingHoursEnabled: boolean;
  agentWorkingHoursStart: string;
  agentWorkingHoursEnd: string;
  agentAutoQualify: boolean;
  agentQualificationQuestions: string[];
  agentBlockedTopics: string[];
  // Timestamps
  createdAt: string;
  updatedAt: string;
}



// Cache global para settings
const settingsCache: {
  data: CompanySettings | null;
  timestamp: number;
  companyId: string | null;
} = {
  data: null,
  timestamp: 0,
  companyId: null
};

// Cache de 2 minutos para settings (muda raramente)
const SETTINGS_CACHE_TTL = 2 * 60 * 1000;

/**
 * Mapeia os dados crus do Supabase para o objeto CompanySettings tipado.
 */
function mapSettingsData(raw: Record<string, unknown>, companyId: string, timezone: string): CompanySettings {
  return {
    id: (raw.id as string) || "",
    companyId: (raw.company_id as string) || companyId,
    // Integrações
    serpapiKey: (raw.serpapi_key as string) || null,
    wahaApiUrl: (raw.waha_api_url as string) || null,
    wahaApiKey: (raw.waha_api_key as string) || null,
    wahaSession: (raw.waha_session as string) || null,
    // Geral
    timezone,
    // Remarketing
    remarketingEnabled: (raw.remarketing_enabled as boolean) ?? COMPANY_SETTINGS_DEFAULTS.remarketingEnabled!,
    remarketingDelayDays: (raw.remarketing_delay_days as number) ?? COMPANY_SETTINGS_DEFAULTS.remarketingDelayDays!,
    remarketingDailyLimit: (raw.remarketing_daily_limit as number) ?? COMPANY_SETTINGS_DEFAULTS.remarketingDailyLimit!,
    remarketingTime: (raw.remarketing_time as string) || COMPANY_SETTINGS_DEFAULTS.remarketingTime!,
    remarketingIntervalMin: (raw.remarketing_interval_min as number) ?? COMPANY_SETTINGS_DEFAULTS.remarketingIntervalMin!,
    remarketingIntervalMax: (raw.remarketing_interval_max as number) ?? COMPANY_SETTINGS_DEFAULTS.remarketingIntervalMax!,
    remarketingMessage: (raw.remarketing_message as string) || COMPANY_SETTINGS_DEFAULTS.remarketingMessage!,
    // Agente IA
    agentEnabled: (raw.agent_enabled as boolean) ?? COMPANY_SETTINGS_DEFAULTS.agentEnabled!,
    agentName: (raw.agent_name as string) || COMPANY_SETTINGS_DEFAULTS.agentName!,
    agentTone: ((raw.agent_tone as string) || COMPANY_SETTINGS_DEFAULTS.agentTone!) as CompanySettings['agentTone'],
    agentPersonality: (raw.agent_personality as string) || COMPANY_SETTINGS_DEFAULTS.agentPersonality!,
    agentSystemPrompt: (raw.agent_system_prompt as string) || COMPANY_SETTINGS_DEFAULTS.agentSystemPrompt!,
    agentWelcomeMessage: (raw.agent_welcome_message as string) || COMPANY_SETTINGS_DEFAULTS.agentWelcomeMessage!,
    agentResponseDelay: (raw.agent_response_delay as number) ?? COMPANY_SETTINGS_DEFAULTS.agentResponseDelay!,
    agentMaxResponseLength: (raw.agent_max_response_length as number) ?? COMPANY_SETTINGS_DEFAULTS.agentMaxResponseLength!,
    agentWorkingHoursEnabled: (raw.agent_working_hours_enabled as boolean) ?? COMPANY_SETTINGS_DEFAULTS.agentWorkingHoursEnabled!,
    agentWorkingHoursStart: (raw.agent_working_hours_start as string) || COMPANY_SETTINGS_DEFAULTS.agentWorkingHoursStart!,
    agentWorkingHoursEnd: (raw.agent_working_hours_end as string) || COMPANY_SETTINGS_DEFAULTS.agentWorkingHoursEnd!,
    agentAutoQualify: (raw.agent_auto_qualify as boolean) ?? COMPANY_SETTINGS_DEFAULTS.agentAutoQualify!,
    agentQualificationQuestions: (raw.agent_qualification_questions as string[]) || COMPANY_SETTINGS_DEFAULTS.agentQualificationQuestions!,
    agentBlockedTopics: (raw.agent_blocked_topics as string[]) || COMPANY_SETTINGS_DEFAULTS.agentBlockedTopics!,
    // Timestamps
    createdAt: (raw.created_at as string) || new Date().toISOString(),
    updatedAt: (raw.updated_at as string) || new Date().toISOString(),
  };
}

// Tipo para saveSettings - chaves parciais do CompanySettings
export type SaveSettingsPayload = Partial<Omit<CompanySettings, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>;

export function useCompanySettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<CompanySettings | null>(settingsCache.data);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchSettings = useCallback(async (forceRefresh = false) => {
    if (!user?.companyId) {
      setSettings(null);
      setIsLoading(false);
      return;
    }

    // Verificar cache
    if (!forceRefresh && settingsCache.companyId === user.companyId && settingsCache.data) {
      const now = Date.now();
      if (now - settingsCache.timestamp < SETTINGS_CACHE_TTL) {
        console.log('[useCompanySettings] Usando cache');
        setSettings(settingsCache.data);
        setIsLoading(false);
        return;
      }
    }

    // Evitar chamadas duplicadas
    if (isFetchingRef.current) {
      return;
    }

    try {
      isFetchingRef.current = true;
      
      // Buscar ambos em paralelo para reduzir latência
      const [settingsResult, companyResult] = await Promise.all([
        supabase
          .from("company_settings")
          .select("*")
          .eq("company_id", user.companyId)
          .maybeSingle(),
        supabase
          .from("companies")
          .select("timezone")
          .eq("id", user.companyId)
          .single()
      ]);

      const { data: settingsData, error: settingsError } = settingsResult;
      const { data: companyData } = companyResult;

      if (settingsError) {
        console.error("Error fetching settings:", settingsError);
      } 
      
      const timezone = (companyData as any)?.timezone || 'America/Sao_Paulo';
      let finalSettings: CompanySettings | null = null;
      
      if (settingsData) {
        finalSettings = mapSettingsData(settingsData as Record<string, unknown>, user.companyId, timezone);
      } else {
        // Criar objeto com defaults quando não tem registro ainda
        finalSettings = mapSettingsData({} as Record<string, unknown>, user.companyId, timezone);
      }
      
      // Atualizar cache
      if (finalSettings) {
        settingsCache.data = finalSettings;
        settingsCache.timestamp = Date.now();
        settingsCache.companyId = user.companyId;
      }
      
      setSettings(finalSettings);

    } catch (error) {
      console.error("Unexpected error:", error);
      setSettings(null);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [user?.companyId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (newSettings: SaveSettingsPayload) => {
    if (!user?.companyId) {
      toast({
        title: "Erro",
        description: "Empresa não encontrada",
        variant: "destructive",
      });
      return false;
    }

    setIsSaving(true);

    try {
      // Montar dados para o Supabase (snake_case)
      const settingsData: Record<string, unknown> = {
        company_id: user.companyId,
        updated_at: new Date().toISOString(),
      };

      // Mapeamento camelCase → snake_case para todos os campos
      const fieldMap: Record<string, string> = COMPANY_SETTINGS_FIELD_MAP;

      // Mapear apenas os campos que foram enviados
      for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
        if (camelKey in newSettings) {
          settingsData[snakeKey] = (newSettings as Record<string, unknown>)[camelKey];
        } else if (settings) {
          // Manter valor existente
          settingsData[snakeKey] = (settings as unknown as Record<string, unknown>)[camelKey];
        }
      }

      if (settings?.id) {
        // Update existing settings
        const { error } = await supabase
          .from("company_settings")
          .update(settingsData as any)
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Insert new settings
        const { error } = await supabase
          .from("company_settings")
          .insert(settingsData as any);

        if (error) throw error;
      }

      // Atualiza Timezone na tabela companies (se foi enviado)
      if (newSettings.timezone && newSettings.timezone !== settings?.timezone) {
        const { error: companyError } = await supabase
          .from("companies")
          .update({ timezone: newSettings.timezone } as any)
          .eq("id", user.companyId);
          
        if (companyError) throw companyError;
      }

      // Forçar refresh ignorando cache após salvar
      await fetchSettings(true);

      toast({
        title: "Sucesso",
        description: "Configurações salvas com sucesso!",
      });

      return true;
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Erro",
        description: "Falha ao salvar configurações",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const hasSerpapiKey = Boolean(settings?.serpapiKey);
  const hasWahaConfig = Boolean(settings?.wahaApiUrl && settings?.wahaApiKey);

  return {
    settings,
    isLoading,
    isSaving,
    saveSettings,
    hasSerpapiKey,
    hasWahaConfig,
    refreshSettings: () => fetchSettings(true),
  };
}