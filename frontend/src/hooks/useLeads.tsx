import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lead, SearchHistory } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SearchResult {
  leads: Lead[];
  hasMore: boolean;
  nextStart: number;
  searchId: string;
  query: string;
  location: string;
}

export function useLeads() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSearching, setIsSearching] = useState(false);

  // --- 1. QUERY: Buscar Leads (Com Cache Infinito para economizar) ---
  const { data: leads = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ['leads', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching leads:", error);
        throw error;
      }

      return (data || []).map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone || "",
        hasWhatsApp: lead.has_whatsapp || false,
        email: lead.email,
        hasEmail: lead.has_email || false,
        address: lead.address || "",
        city: "",
        state: "",
        rating: Number(lead.rating) || 0,
        reviews: lead.reviews_count || 0,
        category: lead.category || "",
        website: lead.website,
        extractedAt: lead.created_at,
        searchId: lead.search_id || undefined,
        companyId: lead.company_id,
      }));
    },
    enabled: !!user?.companyId,
    // CRÍTICO: Não refetch automaticamente. Só atualiza se forçarmos ou na busca.
    staleTime: Infinity, 
    refetchOnWindowFocus: false,
  });

  // --- 2. QUERY: Buscar Histórico ---
  const { data: searchHistory = [] } = useQuery({
    queryKey: ['searchHistory', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      
      const { data, error } = await supabase
        .from("search_history")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching history:", error);
        throw error;
      }

      return (data || []).map((h) => ({
        id: h.id,
        query: h.query,
        location: h.location,
        resultsCount: h.results_count || 0,
        searchedAt: h.created_at,
        userId: h.user_id || undefined,
        companyId: h.company_id,
      }));
    },
    enabled: !!user?.companyId,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache para histórico
  });

  // --- 3. MUTATION: Buscar Leads (Ação Pesada) ---
  const searchMutation = useMutation({
    mutationFn: async ({ query, location, start = 0, existingSearchId }: { query: string, location: string, start?: number, existingSearchId?: string }): Promise<SearchResult | null> => {
      if (!user?.companyId) return null;
      
      let searchId = existingSearchId;

      // 1. Criar histórico se não existir
      if (!searchId) {
        const { data: historyData, error: historyError } = await supabase
          .from("search_history")
          .insert({
            query,
            location,
            results_count: 0,
            company_id: user.companyId,
            user_id: user.id,
          })
          .select()
          .single();

        if (historyError) throw historyError;
        searchId = historyData.id;
      }

      // 2. Chamar Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("search-leads", {
        body: { query, location, companyId: user.companyId, searchId, start },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      if (error || data?.error) throw error || new Error(data?.error);

      // 3. Buscar APENAS os novos leads criados (economiza banda)
      const { data: newLeadsData, error: newLeadsError } = await supabase
        .from("leads")
        .select("*")
        .eq("search_id", searchId)
        .order("created_at", { ascending: false })
        .limit(data?.count || 20);

      if (newLeadsError) throw newLeadsError;

      const newLeadsMapped: Lead[] = (newLeadsData || []).map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone || "",
        hasWhatsApp: lead.has_whatsapp || false,
        email: lead.email,
        hasEmail: lead.has_email || false,
        address: lead.address || "",
        city: "",
        state: "",
        rating: Number(lead.rating) || 0,
        reviews: lead.reviews_count || 0,
        category: lead.category || "",
        website: lead.website,
        extractedAt: lead.created_at,
        searchId: lead.search_id || undefined,
        companyId: lead.company_id,
      }));

      return {
        leads: newLeadsMapped,
        hasMore: data?.hasMore || false,
        nextStart: data?.nextStart || 0,
        searchId: searchId!,
        query,
        location,
      };
    },
    onSuccess: (data) => {
      if (data?.leads) {
        // Atualiza o cache de LEADS adicionando os novos no topo
        queryClient.setQueryData(['leads', user?.companyId], (oldLeads: Lead[] = []) => {
          // Filtra duplicatas caso existam por segurança e adiciona novos
          const newIds = new Set(data.leads.map(l => l.id));
          const filteredOld = oldLeads.filter(l => !newIds.has(l.id));
          return [...data.leads, ...filteredOld];
        });

        // Invalida histórico para atualizar contagem
        queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
      }
    },
    onError: (error) => {
      console.error("Erro na busca:", error);
    }
  });

  // --- 4. MUTATION: Validar Leads (Python Backend) ---
  const validateMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (leadIds.length === 0) return [];
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "";
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${backendUrl}/api/leads/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ lead_ids: leadIds }),
      });

      if (!response.ok) throw new Error("Erro na validação");
      return response.json();
    },
    onSuccess: (data) => {
       if (data.updated && data.updated.length > 0) {
         // Atualiza cache localmente sem refetch
         queryClient.setQueryData(['leads', user?.companyId], (oldLeads: Lead[] = []) => {
           return oldLeads.map(lead => {
             const wasUpdated = data.updated.find((u: any) => u.id === lead.id);
             return wasUpdated ? { ...lead, hasWhatsApp: true } : lead;
           });
         });
       }
    }
  });

  // --- 5. Outras Actions (Delete, Clear) ---
  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData(['leads', user?.companyId], (old: Lead[] = []) => old.filter(l => l.id !== id));
    }
  });

  const clearAllLeadsMutation = useMutation({
    mutationFn: async () => {
      if (!user?.companyId) return;
      const { error } = await supabase.from("leads").delete().eq("company_id", user.companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData(['leads', user?.companyId], []);
    }
  });

  const deleteSearchHistoryMutation = useMutation({
    mutationFn: async (searchId: string) => {
      // Deleta leads e histórico
      await supabase.from("leads").delete().eq("search_id", searchId);
      await supabase.from("search_history").delete().eq("id", searchId);
      return searchId;
    },
    onSuccess: (searchId) => {
      queryClient.setQueryData(['searchHistory', user?.companyId], (old: SearchHistory[] = []) => old.filter(h => h.id !== searchId));
      queryClient.setQueryData(['leads', user?.companyId], (old: Lead[] = []) => old.filter(l => l.searchId !== searchId));
    }
  });

  const clearAllHistoryMutation = useMutation({
    mutationFn: async () => {
      if (!user?.companyId) return;
      await supabase.from("leads").delete().eq("company_id", user.companyId);
      await supabase.from("search_history").delete().eq("company_id", user.companyId);
    },
    onSuccess: () => {
      queryClient.setQueryData(['leads', user?.companyId], []);
      queryClient.setQueryData(['searchHistory', user?.companyId], []);
    }
  });

  // --- Wrapper Functions para manter compatibilidade ---
  
  const searchLeads = async (query: string, location: string, start: number = 0, existingSearchId?: string) => {
    setIsSearching(true);
    try {
      const result = await searchMutation.mutateAsync({ query, location, start, existingSearchId });
      return result;
    } catch (e) {
      return null;
    } finally {
      setIsSearching(false);
    }
  };

  const validateLeads = async (leadIds: string[]) => {
    try {
      const data = await validateMutation.mutateAsync(leadIds);
      return data.updated || [];
    } catch { return []; }
  };

  return {
    leads,
    searchHistory,
    isSearching, // Estado local para UI de 'buscando...'
    isLoading: isLoadingLeads, // Estado global de 'carregando dados iniciais'
    searchLeads,
    validateLeads,
    deleteLead: (id: string) => deleteLeadMutation.mutate(id),
    clearAllLeads: () => clearAllLeadsMutation.mutate(),
    getLeadsBySearchId: (searchId: string) => leads.filter((l) => l.searchId === searchId),
    deleteSearchHistory: (id: string) => deleteSearchHistoryMutation.mutate(id),
    clearAllHistory: () => clearAllHistoryMutation.mutate(),
    refreshData: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  };
}
