import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface CompanySettings {
  id: string;
  companyId: string;
  serpapiKey: string | null;
  wahaApiUrl: string | null;
  wahaApiKey: string | null;
  wahaSession: string | null;
  timezone: string; // NOVO CAMPO
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
      
      let finalSettings: CompanySettings | null = null;
      
      // Monta o objeto final combinando as duas tabelas
      if (settingsData) {
        finalSettings = {
          id: settingsData.id,
          companyId: settingsData.company_id,
          serpapiKey: settingsData.serpapi_key,
          wahaApiUrl: settingsData.waha_api_url,
          wahaApiKey: settingsData.waha_api_key,
          wahaSession: settingsData.waha_session,
          timezone: companyData?.timezone || 'America/Sao_Paulo',
          createdAt: settingsData.created_at,
          updatedAt: settingsData.updated_at,
        };
      } else if (companyData) {
        finalSettings = {
          id: "",
          companyId: user.companyId,
          serpapiKey: null,
          wahaApiUrl: null,
          wahaApiKey: null,
          wahaSession: null,
          timezone: companyData.timezone || 'America/Sao_Paulo',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
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

  const saveSettings = async (newSettings: {
    serpapiKey?: string;
    wahaApiUrl?: string;
    wahaApiKey?: string;
    wahaSession?: string;
    timezone?: string; // NOVO CAMPO OPCIONAL
  }) => {
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
      // 1. Atualiza company_settings (API Keys)
      // Nota: waha_session não deve ser "default" - deixar null para o sistema gerar automaticamente
      const settingsData = {
        company_id: user.companyId,
        serpapi_key: newSettings.serpapiKey !== undefined ? newSettings.serpapiKey : settings?.serpapiKey,
        waha_api_url: newSettings.wahaApiUrl !== undefined ? newSettings.wahaApiUrl : settings?.wahaApiUrl,
        waha_api_key: newSettings.wahaApiKey !== undefined ? newSettings.wahaApiKey : settings?.wahaApiKey,
        waha_session: newSettings.wahaSession !== undefined ? newSettings.wahaSession : settings?.wahaSession,
        updated_at: new Date().toISOString(),
      };

      if (settings?.id) {
        // Update existing settings
        const { error } = await supabase
          .from("company_settings")
          .update({
            serpapi_key: settingsData.serpapi_key,
            waha_api_url: settingsData.waha_api_url,
            waha_api_key: settingsData.waha_api_key,
            waha_session: settingsData.waha_session,
            updated_at: settingsData.updated_at
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Insert new settings
        const { error } = await supabase
          .from("company_settings")
          .insert(settingsData);

        if (error) throw error;
      }

      // 2. Atualiza Timezone na tabela companies (se foi enviado)
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
    refreshSettings: () => fetchSettings(true), // Forçar refresh
  };
}