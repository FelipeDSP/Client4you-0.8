import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AGENT_CONFIG_DEFAULTS } from "@/lib/defaults";

/**
 * Hook para gerenciar a configuração do agente IA da empresa.
 * Após o reset cirúrgico, agent_configs é a tabela canônica
 * (os campos agent_* foram removidos de company_settings).
 */

export interface AgentConfig {
  id: string;
  companyId: string;
  enabled: boolean;
  name: string;
  tone: 'formal' | 'casual' | 'professional' | 'friendly';
  personality: string;
  systemPrompt: string;
  welcomeMessage: string;
  responseDelay: number;
  maxResponseLength: number;
  autoQualify: boolean;
  qualificationQuestions: string[];
  blockedTopics: string[];
  workingHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  language: string;
  model: string;
  temperature: number;
}

export type SaveAgentConfigPayload = Partial<Omit<AgentConfig, 'id' | 'companyId'>>;

function mapRowToConfig(raw: Record<string, unknown>, companyId: string): AgentConfig {
  const wh = (raw.working_hours as Record<string, unknown> | null) || {};
  const qq = raw.qualification_questions;
  const bt = raw.blocked_topics;

  return {
    id: (raw.id as string) || '',
    companyId: (raw.company_id as string) || companyId,
    enabled: (raw.enabled as boolean) ?? AGENT_CONFIG_DEFAULTS.enabled,
    name: (raw.name as string) || AGENT_CONFIG_DEFAULTS.name,
    tone: ((raw.tone as string) || AGENT_CONFIG_DEFAULTS.tone) as AgentConfig['tone'],
    personality: (raw.personality as string) || AGENT_CONFIG_DEFAULTS.personality,
    systemPrompt: (raw.system_prompt as string) || AGENT_CONFIG_DEFAULTS.systemPrompt,
    welcomeMessage: (raw.welcome_message as string) || AGENT_CONFIG_DEFAULTS.welcomeMessage,
    responseDelay: (raw.response_delay as number) ?? AGENT_CONFIG_DEFAULTS.responseDelay,
    maxResponseLength: (raw.max_response_length as number) ?? AGENT_CONFIG_DEFAULTS.maxResponseLength,
    autoQualify: (raw.auto_qualify as boolean) ?? AGENT_CONFIG_DEFAULTS.autoQualify,
    qualificationQuestions: Array.isArray(qq)
      ? (qq as string[])
      : AGENT_CONFIG_DEFAULTS.qualificationQuestions,
    blockedTopics: Array.isArray(bt)
      ? (bt as string[])
      : AGENT_CONFIG_DEFAULTS.blockedTopics,
    workingHours: {
      enabled: (wh.enabled as boolean) ?? AGENT_CONFIG_DEFAULTS.workingHours.enabled,
      start: (wh.start as string) || AGENT_CONFIG_DEFAULTS.workingHours.start,
      end: (wh.end as string) || AGENT_CONFIG_DEFAULTS.workingHours.end,
    },
    language: (raw.language as string) || AGENT_CONFIG_DEFAULTS.language,
    model: (raw.model as string) || AGENT_CONFIG_DEFAULTS.model,
    temperature: (raw.temperature as number) ?? AGENT_CONFIG_DEFAULTS.temperature,
  };
}

export function useAgentConfig() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchConfig = useCallback(async () => {
    if (!user?.companyId) {
      setConfig(null);
      setIsLoading(false);
      return;
    }
    if (isFetchingRef.current) return;

    try {
      isFetchingRef.current = true;
      const { data, error } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('company_id', user.companyId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('[useAgentConfig] erro ao carregar:', error);
      }

      const mapped = mapRowToConfig(
        (data as Record<string, unknown>) || {},
        user.companyId
      );
      setConfig(mapped);
    } catch (e) {
      console.error('[useAgentConfig] erro inesperado:', e);
      setConfig(null);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [user?.companyId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async (payload: SaveAgentConfigPayload): Promise<boolean> => {
    if (!user?.companyId) {
      toast({ title: 'Erro', description: 'Empresa não encontrada', variant: 'destructive' });
      return false;
    }
    setIsSaving(true);
    try {
      const merged: AgentConfig = {
        ...(config || mapRowToConfig({}, user.companyId)),
        ...payload,
        workingHours: {
          ...(config?.workingHours || AGENT_CONFIG_DEFAULTS.workingHours),
          ...(payload.workingHours || {}),
        },
        companyId: user.companyId,
      };

      const dbPayload: Record<string, unknown> = {
        company_id: user.companyId,
        enabled: merged.enabled,
        name: merged.name,
        tone: merged.tone,
        personality: merged.personality,
        system_prompt: merged.systemPrompt,
        welcome_message: merged.welcomeMessage,
        response_delay: merged.responseDelay,
        max_response_length: merged.maxResponseLength,
        auto_qualify: merged.autoQualify,
        qualification_questions: merged.qualificationQuestions,
        blocked_topics: merged.blockedTopics,
        working_hours: merged.workingHours,
        language: merged.language,
        model: merged.model,
        temperature: merged.temperature,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('agent_configs')
        .upsert(dbPayload as any, { onConflict: 'company_id' });

      if (error) throw error;

      await fetchConfig();
      toast({ title: 'Sucesso', description: 'Agente atualizado!' });
      return true;
    } catch (e) {
      console.error('[useAgentConfig] erro ao salvar:', e);
      toast({
        title: 'Erro',
        description: 'Falha ao salvar configurações do agente',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    config,
    isLoading,
    isSaving,
    saveConfig,
    refresh: fetchConfig,
  };
}
