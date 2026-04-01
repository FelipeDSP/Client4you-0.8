import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { makeAuthenticatedRequest } from "@/lib/api";

const API_URL = import.meta.env.VITE_BACKEND_URL || "";

// --- Tipos e Interfaces ---

export interface UserQuota {
  id: string;
  user_id: string;
  company_id: string;
  plan_type: 'basico' | 'intermediario' | 'avancado' | 'suspended';
  plan_name: string;
  leads_limit: number;
  leads_used: number;
  campaigns_limit: number;
  campaigns_used: number;
  messages_limit: number;
  messages_sent: number;
  reset_date: string;
  plan_expires_at?: string;
  subscription_status?: 'active' | 'suspended' | 'canceled' | 'inactive';
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  used?: number;
  limit?: number;
  unlimited?: boolean;
  plan_type?: string;
}

// --- Hook Otimizado com React Query ---

export function useQuotas() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // 1. QUERY: Buscar Quotas (Cacheada e Deduplicada)
  const { 
    data: quota = null, 
    isLoading, 
    error: queryError 
  } = useQuery({
    queryKey: ['user-quota', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      console.log('[useQuotas] Buscando quota do servidor (Request Real)...');
      const response = await makeAuthenticatedRequest(`${API_URL}/api/quotas/me`);
      
      if (!response.ok) {
        if (response.status === 401) throw new Error("Sessão expirada");
        throw new Error(`Erro ${response.status}`);
      }
      
      const data = await response.json();
      return data as UserQuota;
    },
    enabled: !!user?.id,
    // Cache forte de 5 minutos. Evita recarregar ao mudar de aba/página.
    staleTime: 1000 * 60 * 5, 
    refetchOnWindowFocus: false, 
    retry: 1
  });

  // 2. MUTATION: Incrementar Quota
  const incrementMutation = useMutation({
    mutationFn: async ({ action, amount }: { action: 'lead_search' | 'campaign_send' | 'message_send', amount: number }) => {
      const response = await makeAuthenticatedRequest(
        `${API_URL}/api/quotas/increment?action=${action}&amount=${amount}`,
        { method: 'POST' }
      );
      if (!response.ok) throw new Error("Falha ao incrementar");
      return true;
    },
    onSuccess: () => {
      // Atualiza os dados locais puxando do servidor novamente após incrementar
      queryClient.invalidateQueries({ queryKey: ['user-quota'] });
    }
  });

  // 3. Funções Auxiliares (Logic Check)
  
  const checkQuota = useCallback(async (action: 'lead_search' | 'campaign_send' | 'message_send'): Promise<QuotaCheckResult> => {
    if (!user?.id) return { allowed: false, reason: 'Usuário não autenticado' };

    // Otimização: Verificar cache local primeiro para casos Ilimitados (-1)
    if (quota) {
      let limit = 0;
      let used = 0;
      
      if (action === 'lead_search') {
        limit = quota.leads_limit;
        used = quota.leads_used;
      } else if (action === 'campaign_send') {
        limit = quota.campaigns_limit;
        used = quota.campaigns_used;
      } else if (action === 'message_send') {
        limit = quota.messages_limit;
        used = quota.messages_sent;
      }
      
      // Se for ilimitado no cache, retorna IMEDIATAMENTE sem bater no servidor (Economia de Request)
      if (limit === -1) {
        console.log(`[useQuotas] Check Local: ${action} é ILIMITADO. Economizando request.`);
        return { allowed: true, unlimited: true, used, limit: -1 };
      }
    }

    // Se não for ilimitado ou não tiver cache, valida no servidor
    try {
      const response = await makeAuthenticatedRequest(
        `${API_URL}/api/quotas/check?action=${action}`,
        { method: 'POST' }
      );
      
      if (response.ok) {
        const result = await response.json();
        // Sincroniza cache se o servidor disser algo novo
        if (result.limit === -1) return { ...result, allowed: true, unlimited: true };
        return result;
      }
      
      const errorData = await response.json().catch(() => ({}));
      return { allowed: false, reason: errorData.detail || 'Erro ao verificar quota' };
    } catch (error) {
      console.error("Error checking quota:", error);
      return { allowed: false, reason: 'Erro de conexão' };
    }
  }, [user?.id, quota]); // Dependência 'quota' permite a otimização local

  const incrementQuota = async (action: 'lead_search' | 'campaign_send' | 'message_send', amount: number = 1): Promise<boolean> => {
    if (!user?.id) return false;
    try {
      await incrementMutation.mutateAsync({ action, amount });
      return true;
    } catch (e) {
      console.error("Erro ao incrementar:", e);
      return false;
    }
  };

  // Helper values derivados do cache
  const hasUnlimitedLeads = quota?.leads_limit === -1;
  const hasUnlimitedCampaigns = quota?.campaigns_limit === -1;
  const canUseCampaigns = quota ? quota.campaigns_limit !== 0 : false;
  
  const leadsPercentage = quota && !hasUnlimitedLeads
    ? Math.min((quota.leads_used / quota.leads_limit) * 100, 100)
    : 0;

  const isPlanExpired = quota?.plan_expires_at 
    ? new Date(quota.plan_expires_at) < new Date()
    : false;

  return {
    quota,
    isLoading,
    error: queryError ? (queryError as Error).message : null,
    checkQuota,
    incrementQuota,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['user-quota'] }),
    // Helpers
    hasUnlimitedLeads,
    hasUnlimitedCampaigns,
    canUseCampaigns,
    leadsPercentage,
    isPlanExpired
  };
}
