import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { makeAuthenticatedRequest } from "@/lib/api";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

// --- Interfaces (Mantidas iguais para compatibilidade) ---

export type CampaignStatus = "draft" | "ready" | "running" | "paused" | "completed" | "cancelled";
export type MessageType = "text" | "image" | "document";

export interface CampaignMessage {
  type: MessageType;
  text: string;
  media_url?: string;
  media_base64?: string;
  media_filename?: string;
}

export interface CampaignSettings {
  interval_min: number;
  interval_max: number;
  start_time?: string;
  end_time?: string;
  daily_limit?: number;
  working_days: number[];
}

export interface CampaignStats {
  total: number;
  sent: number;
  pending: number;
  errors: number;
  progress_percent: number;
}

export interface Campaign {
  id: string;
  user_id: string;
  company_id: string;
  name: string;
  status: CampaignStatus;
  message: CampaignMessage;
  settings: CampaignSettings;
  total_contacts: number;
  sent_count: number;
  error_count: number;
  pending_count: number;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  stats: CampaignStats;
  is_worker_running: boolean;
  is_actively_sending?: boolean;
}

export interface Contact {
  id: string;
  campaign_id: string;
  name: string;
  phone: string;
  email?: string;
  category?: string;
  extra_data: Record<string, string>;
  status: "pending" | "sent" | "error" | "skipped";
  error_message?: string;
  sent_at?: string;
}

export interface MessageLog {
  id: string;
  campaign_id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  status: "pending" | "sent" | "error" | "skipped";
  error_message?: string;
  message_sent?: string;
  sent_at: string;
}

// --- Hook Otimizado com React Query ---

export function useCampaigns() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // 1. QUERY: Busca lista de campanhas com Cache
  // staleTime: 30000 -> Evita requests repetidos se você trocar de aba e voltar rápido (30s)
  const { 
    data: campaigns = [], 
    isLoading, 
    error: queryError 
  } = useQuery({
    queryKey: ['campaigns', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      
      const response = await makeAuthenticatedRequest(`${BACKEND_URL}/api/campaigns`);
      
      if (!response.ok) {
        if (response.status === 401) throw new Error("Sessão expirada. Faça login novamente.");
        if (response.status === 403) throw new Error("Sem permissão.");
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Erro ${response.status}`);
      }
      
      const data = await response.json();
      return data.campaigns || [];
    },
    enabled: !!user?.companyId,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: true, 
  });

  // Helpers de sucesso e erro para as mutations
  const handleSuccess = (msg: string) => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    toast({ title: "Sucesso", description: msg });
  };

  const handleError = (error: any, action: string) => {
    console.error(`Erro ao ${action}:`, error);
    toast({
      title: "Erro",
      description: error.message || `Falha ao ${action}.`,
      variant: "destructive",
    });
  };

  // 2. MUTATIONS: Ações de escrita

  const createCampaignMutation = useMutation({
    mutationFn: async (data: { name: string; message: CampaignMessage; settings: CampaignSettings }) => {
      const response = await makeAuthenticatedRequest(`${BACKEND_URL}/api/campaigns`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao criar campanha");
      }
      return response.json();
    },
    onSuccess: (data) => handleSuccess(`Campanha "${data.name}" criada!`),
    onError: (e) => handleError(e, "criar campanha"),
  });

  const uploadContactsMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await makeAuthenticatedRequest(`${BACKEND_URL}/api/campaigns/${id}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Erro no upload");
      }
      return response.json();
    },
    onSuccess: (data) => handleSuccess(`${data.total_imported} contatos importados.`),
    onError: (e) => handleError(e, "fazer upload"),
  });

  const genericActionMutation = useMutation({
    mutationFn: async ({ id, action, method = "POST", params }: { id: string; action: string; method?: string; params?: any }) => {
      // Monta URL com query params se existirem (ex: start campaign)
      let url = `${BACKEND_URL}/api/campaigns/${id}`;
      if (action) url += `/${action}`;
      
      if (params) {
        const searchParams = new URLSearchParams(params);
        url += `?${searchParams.toString()}`;
      }

      const response = await makeAuthenticatedRequest(url, { method });
      
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ao ${action || 'excluir'}`);
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
        const actionMap: Record<string, string> = {
            'start': 'iniciada',
            'pause': 'pausada',
            'cancel': 'cancelada',
            'reset': 'resetada',
            '': 'excluída' // Delete action tem string vazia no endpoint final
        };
        const verb = actionMap[variables.action] || 'atualizada';
        handleSuccess(`Campanha ${verb} com sucesso.`);
    },
    onError: (e) => handleError(e, "executar ação"),
  });

  const createFromLeadsMutation = useMutation({
    mutationFn: async (data: any) => {
        const response = await makeAuthenticatedRequest(`${BACKEND_URL}/api/campaigns/from-leads`, {
            method: "POST",
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error("Erro ao criar campanha");
        return response.json();
    },
    onSuccess: () => handleSuccess("Campanha criada a partir dos leads!"),
    onError: (e) => handleError(e, "criar campanha dos leads"),
  });

  // --- Wrapper Functions para manter compatibilidade com seus componentes ---

  const createCampaign = async (name: string, message: CampaignMessage, settings: CampaignSettings) => {
    const result = await createCampaignMutation.mutateAsync({ name, message, settings }).catch(() => null);
    return result;
  };

  const uploadContacts = async (campaignId: string, file: File) => {
    try {
        await uploadContactsMutation.mutateAsync({ id: campaignId, file });
        return true;
    } catch { return false; }
  };

  const startCampaign = async (campaignId: string, wahaConfig?: { url: string; apiKey: string; session: string }) => {
    try {
        // Mapeia o config para os params que o backend espera
        const params = wahaConfig ? {
            waha_url: wahaConfig.url,
            waha_api_key: wahaConfig.apiKey,
            waha_session: wahaConfig.session
        } : undefined;

        await genericActionMutation.mutateAsync({ id: campaignId, action: 'start', params });
        return true;
    } catch { return false; }
  };

  const pauseCampaign = async (id: string) => {
    try { await genericActionMutation.mutateAsync({ id, action: 'pause' }); return true; } catch { return false; }
  };
  
  const cancelCampaign = async (id: string) => {
    try { await genericActionMutation.mutateAsync({ id, action: 'cancel' }); return true; } catch { return false; }
  };

  const resetCampaign = async (id: string) => {
    try { await genericActionMutation.mutateAsync({ id, action: 'reset' }); return true; } catch { return false; }
  };

  const deleteCampaign = async (id: string) => {
    try { await genericActionMutation.mutateAsync({ id, action: '', method: 'DELETE' }); return true; } catch { return false; }
  };

  const createCampaignFromLeads = async (data: any) => {
    return createFromLeadsMutation.mutateAsync(data);
  };

  // Função para logs (apenas leitura, sem cache necessário pois é sob demanda)
  const getMessageLogs = async (campaignId: string, limit: number = 100): Promise<MessageLog[]> => {
    try {
      const response = await makeAuthenticatedRequest(`${BACKEND_URL}/api/campaigns/${campaignId}/logs?limit=${limit}`);
      if (!response.ok) throw new Error("Erro");
      const data = await response.json();
      return data.logs || [];
    } catch (error) {
      console.error("Error fetching logs:", error);
      return [];
    }
  };

  return {
    campaigns,
    isLoading,
    error: queryError ? (queryError as Error).message : null,
    fetchCampaigns: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }), // Mantido para compatibilidade
    createCampaign,
    createCampaignFromLeads,
    uploadContacts,
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    resetCampaign,
    deleteCampaign,
    getMessageLogs,
  };
}
