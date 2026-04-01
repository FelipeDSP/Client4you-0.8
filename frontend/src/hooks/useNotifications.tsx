import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { makeAuthenticatedRequest } from "@/lib/api";

const API_URL = import.meta.env.VITE_BACKEND_URL || "";

export interface Notification {
  id: string;
  user_id: string;
  company_id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  metadata?: any;
  created_at: string;
  read_at?: string;
}

/**
 * Hook to track if the browser tab is visible.
 * Pauses polling when the tab is hidden to save bandwidth.
 */
function usePageVisible(): boolean {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return isVisible;
}

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isPageVisible = usePageVisible();

  // 1. Busca unificada e cacheada
  // Polls every 2 minutes ONLY when the tab is visible (saves bandwidth when idle)
  const { data: notifications = [], isLoading, error } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const response = await makeAuthenticatedRequest(`${API_URL}/api/notifications?unread_only=false&limit=20`);
      if (!response.ok) throw new Error("Falha ao buscar notificações");
      const data = await response.json();
      return data.notifications || [];
    },
    enabled: !!user?.id,
    refetchInterval: isPageVisible ? 120000 : false, // Stop polling when tab is hidden
    staleTime: 60000,
    refetchOnWindowFocus: true, // Immediate refresh when user returns to tab
  });

  // 2. Unread Count derivado do cache (Zero requests extras!)
  // O React Query já tem os dados, não precisamos bater na API de novo só pra contar
  const unreadCount = notifications.filter((n: Notification) => !n.read).length;

  // 3. Mutation para marcar como lida
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await makeAuthenticatedRequest(`${API_URL}/api/notifications/${notificationId}/read`, { method: "PUT" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] }); // Atualiza a lista automaticamente
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await makeAuthenticatedRequest(`${API_URL}/api/notifications/mark-all-read`, { method: "PUT" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  };
}
