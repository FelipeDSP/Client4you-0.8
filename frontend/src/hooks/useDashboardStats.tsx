import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { makeAuthenticatedRequest } from "@/lib/api";

const API_URL = import.meta.env.VITE_BACKEND_URL || "";

export interface DashboardStats {
  total_leads: number;
  total_campaigns: number;
  active_campaigns: number;
  total_messages_sent: number;
  messages_sent_today: number;
}

export function useDashboardStats() {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats', user?.companyId],
    queryFn: async (): Promise<DashboardStats> => {
      const response = await makeAuthenticatedRequest(`${API_URL}/api/dashboard/stats`);
      if (!response.ok) throw new Error("Erro ao buscar estatísticas");
      return response.json();
    },
    enabled: !!user?.companyId,
    staleTime: 60000, // 1 minute
    refetchInterval: 120000, // Refresh every 2 minutes
    refetchOnWindowFocus: true,
  });

  return {
    stats: data || {
      total_leads: 0,
      total_campaigns: 0,
      active_campaigns: 0,
      total_messages_sent: 0,
      messages_sent_today: 0,
    },
    isLoading,
    error,
  };
}
