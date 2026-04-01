import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

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
  // Defaults do Disparador
  defaultIntervalMin: number;
  defaultIntervalMax: number;
  defaultDailyLimit: number;
  defaultStartTime: string;
  defaultEndTime: string;
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

// Valores padrão para novos campos
const DEFAULTS: Partial<CompanySettings> = {
  defaultIntervalMin: 60,
  defaultIntervalMax: 180,
  defaultDailyLimit: 200,
  defaultStartTime: '08:00',
  defaultEndTime: '18:00',
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
    // Defaults Disparador
    defaultIntervalMin: (raw.default_interval_min as number) ?? DEFAULTS.defaultIntervalMin!,
    defaultIntervalMax: (raw.default_interval_max as number) ?? DEFAULTS.defaultIntervalMax!,
    defaultDailyLimit: (raw.default_daily_limit as number) ?? DEFAULTS.defaultDailyLimit!,
    defaultStartTime: (raw.default_start_time as string) || DEFAULTS.defaultStartTime!,
    defaultEndTime: (raw.default_end_time as string) || DEFAULTS.defaultEndTime!,
    // Remarketing
    remarketingEnabled: (raw.remarketing_enabled as boolean) ?? DEFAULTS.remarketingEnabled!,
    remarketingDelayDays: (raw.remarketing_delay_days as number) ?? DEFAULTS.remarketingDelayDays!,
    remarketingDailyLimit: (raw.remarketing_daily_limit as number) ?? DEFAULTS.remarketingDailyLimit!,
    remarketingTime: (raw.remarketing_time as string) || DEFAULTS.remarketingTime!,
    remarketingIntervalMin: (raw.remarketing_interval_min as number) ?? DEFAULTS.remarketingIntervalMin!,
    remarketingIntervalMax: (raw.remarketing_interval_max as number) ?? DEFAULTS.remarketingIntervalMax!,
    remarketingMessage: (raw.remarketing_message as string) || DEFAULTS.remarketingMessage!,
    // Agente IA
    agentEnabled: (raw.agent_enabled as boolean) ?? DEFAULTS.agentEnabled!,
    agentName: (raw.agent_name as string) || DEFAULTS.agentName!,
    agentTone: ((raw.agent_tone as string) || DEFAULTS.agentTone!) as CompanySettings['agentTone'],
    agentPersonality: (raw.agent_personality as string) || DEFAULTS.agentPersonality!,
    agentSystemPrompt: (raw.agent_system_prompt as string) || DEFAULTS.agentSystemPrompt!,
    agentWelcomeMessage: (raw.agent_welcome_message as string) || DEFAULTS.agentWelcomeMessage!,
    agentResponseDelay: (raw.agent_response_delay as number) ?? DEFAULTS.agentResponseDelay!,
    agentMaxResponseLength: (raw.agent_max_response_length as number) ?? DEFAULTS.agentMaxResponseLength!,
    agentWorkingHoursEnabled: (raw.agent_working_hours_enabled as boolean) ?? DEFAULTS.agentWorkingHoursEnabled!,
    agentWorkingHoursStart: (raw.agent_working_hours_start as string) || DEFAULTS.agentWorkingHoursStart!,
    agentWorkingHoursEnd: (raw.agent_working_hours_end as string) || DEFAULTS.agentWorkingHoursEnd!,
    agentAutoQualify: (raw.agent_auto_qualify as boolean) ?? DEFAULTS.agentAutoQualify!,
    agentQualificationQuestions: (raw.agent_qualification_questions as string[]) || DEFAULTS.agentQualificationQuestions!,
    agentBlockedTopics: (raw.agent_blocked_topics as string[]) || DEFAULTS.agentBlockedTopics!,
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
      
      const timezone = companyData?.timezone || 'America/Sao_Paulo';
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
      const fieldMap: Record<string, string> = {
        serpapiKey: 'serpapi_key',
        wahaApiUrl: 'waha_api_url',
        wahaApiKey: 'waha_api_key',
        wahaSession: 'waha_session',
        defaultIntervalMin: 'default_interval_min',
        defaultIntervalMax: 'default_interval_max',
        defaultDailyLimit: 'default_daily_limit',
        defaultStartTime: 'default_start_time',
        defaultEndTime: 'default_end_time',
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
          .update(settingsData)
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Insert new settings
        const { error } = await supabase
          .from("company_settings")
          .insert(settingsData);

        if (error) throw error;
      }

      // Atualiza Timezone na tabela companies (se foi enviado)
      if (newSettings.timezone && newSettings.timezone !== settings?.timezone) {
        const { error: companyError } = await supabase
          .from("companies")
          .update({ timezone: newSettings.timezone })
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