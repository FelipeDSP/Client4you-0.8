import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { makeAuthenticatedRequest } from "@/lib/api";

export type WAStatus = "LOADING" | "DISCONNECTED" | "STARTING" | "SCANNING" | "CONNECTED" | "NOT_CONFIGURED";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "";

function usePageVisible(): boolean {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return isVisible;
}

export function useWahaStatus() {
  const queryClient = useQueryClient();
  const isPageVisible = usePageVisible();

  const { data, isLoading, error } = useQuery({
    queryKey: ['waha-status'],
    queryFn: async () => {
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/whatsapp/status`, { method: "GET" });
      if (!response.ok) throw new Error("Erro ao verificar status");
      return response.json();
    },
    // Smart polling: fast during scanning, slow when connected, stopped when tab hidden
    refetchInterval: (query) => {
      if (!isPageVisible) return false; // Stop polling when tab is hidden
      const status = query.state.data?.status?.toUpperCase();
      if (status === 'SCANNING' || status === 'STARTING') return 5000;
      if (status === 'CONNECTED') return 60000;
      return 30000;
    },
    refetchOnWindowFocus: "always",
  });

  const status: WAStatus = data?.status ? data.status.toUpperCase() : "DISCONNECTED";
  const sessionName = data?.session_name || null;

  return {
    status: isLoading ? "LOADING" : status,
    isLoading,
    isConnected: status === "CONNECTED",
    sessionName,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['waha-status'] }),
  };
}
