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

  // --- 1. QUERY: Base de Leads (só os marcados com saved_at) ---
  const { data: leads = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ['leads', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];

      // Só leads SALVOS pelo usuário (saved_at preenchido). Os resultados
      // transitórios de busca (saved_at NULL) ficam fora da Base.
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("company_id", user.companyId)
        .not("saved_at", "is", null)
        .order("saved_at", { ascending: false });

      if (error) {
        console.error("Error fetching leads:", error);
        throw error;
      }

      return (data || []).map((lead: any) => ({
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
        savedAt: lead.saved_at,
      }));
    },
    enabled: !!user?.companyId,
    // 5min é equilíbrio: evita refetch a cada navegação mas pega
    // novos leads inseridos por outro fluxo (campanha, remarketing, etc.)
    // sem precisar refresh manual.
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  // --- 2. QUERY: Buscar Histórico ---
  const { data: searchHistory = [] } = useQuery({
    queryKey: ['searchHistory', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      
      // Defense-in-depth: filtra explicitamente por company_id.
      const { data, error } = await supabase
        .from("search_history")
        .select("*")
        .eq("company_id", user.companyId)
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

      // 3. Buscar APENAS os novos leads criados (economiza banda).
      // Defense-in-depth: search_id já restringe, mas adiciona company_id
      // explicitamente para o caso de search_ids colidirem entre empresas.
      const { data: newLeadsData, error: newLeadsError } = await supabase
        .from("leads")
        .select("*")
        .eq("search_id", searchId)
        .eq("company_id", user.companyId)
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

  // --- 4. MUTATION: Extrair Emails via Firecrawl ---
  const enrichEmailsMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (leadIds.length === 0) return [];
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "";
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${backendUrl}/api/leads/enrich-emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ lead_ids: leadIds }),
      });

      if (!response.ok) throw new Error("Erro na extração de emails");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.updated && data.updated.length > 0) {
        queryClient.setQueryData(['leads', user?.companyId], (oldLeads: Lead[] = []) =>
          oldLeads.map(lead => {
            const updated = data.updated.find((u: any) => u.id === lead.id);
            return updated ? { ...lead, email: updated.email } : lead;
          })
        );
      }
    },
  });

  // --- 5. MUTATION: Adicionar lead manualmente (vai direto pra Base) ---
  const addManualLeadMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      email?: string;
      phone?: string;
      website?: string;
      address?: string;
      category?: string;
      hasWhatsApp?: boolean;
    }) => {
      if (!user?.companyId) throw new Error("Sem empresa associada");
      const phoneClean = payload.phone ? payload.phone.replace(/\D/g, "") : null;
      const { data, error } = await supabase
        .from("leads")
        .insert({
          company_id: user.companyId,
          name: payload.name.trim(),
          email: payload.email?.trim() || null,
          phone: phoneClean || null,
          website: payload.website?.trim() || null,
          address: payload.address?.trim() || null,
          category: payload.category?.trim() || null,
          has_whatsapp: !!payload.hasWhatsApp,
          has_email: !!payload.email?.trim(),
          saved_at: new Date().toISOString(),
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Adiciona o lead no topo do cache local sem refetch
      queryClient.setQueryData(["leads", user?.companyId], (old: Lead[] = []) => [
        {
          id: data.id,
          name: data.name,
          phone: data.phone || "",
          hasWhatsApp: data.has_whatsapp || false,
          email: data.email,
          hasEmail: data.has_email || false,
          address: data.address || "",
          city: "",
          state: "",
          rating: Number(data.rating) || 0,
          reviews: data.reviews_count || 0,
          category: data.category || "",
          website: data.website,
          extractedAt: data.created_at,
          searchId: data.search_id || undefined,
          companyId: data.company_id,
        } as Lead,
        ...old,
      ]);
    },
  });

  // --- 6. MUTATION: Salvar leads na Base de Leads ---
  const saveLeadsToBaseMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (!user?.companyId || leadIds.length === 0) return { saved: 0 };
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("leads")
        .update({ saved_at: nowIso } as any)
        .in("id", leadIds)
        .eq("company_id", user.companyId)
        .is("saved_at", null);
      if (error) throw error;
      return { saved: leadIds.length };
    },
    onSuccess: () => {
      // Invalida a Base — refetch traz os recém-salvos
      queryClient.invalidateQueries({ queryKey: ['leads', user?.companyId] });
    },
  });

  // --- 7. Outras Actions (Delete, Clear) ---
  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.companyId) throw new Error("Sem empresa associada");
      const { error } = await supabase
        .from("leads")
        .delete()
        .eq("id", id)
        .eq("company_id", user.companyId);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData(['leads', user?.companyId], (old: Lead[] = []) => old.filter(l => l.id !== id));
    }
  });

  // "Limpar base" só apaga os SALVOS, não os resultados transitórios de busca.
  const clearAllLeadsMutation = useMutation({
    mutationFn: async () => {
      if (!user?.companyId) return;
      const { error } = await supabase
        .from("leads")
        .delete()
        .eq("company_id", user.companyId)
        .not("saved_at", "is", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData(['leads', user?.companyId], []);
    }
  });

  // Deletar um item de histórico: só apaga search_history (FK ON DELETE SET
  // NULL nos leads salvos preserva eles na Base). Os transitórios da search
  // também caem porque ninguém referencia mais.
  const deleteSearchHistoryMutation = useMutation({
    mutationFn: async (searchId: string) => {
      if (!user?.companyId) throw new Error("Sem empresa associada");
      // Apaga leads transitórios (não salvos) dessa busca explicitamente
      await supabase
        .from("leads")
        .delete()
        .eq("search_id", searchId)
        .eq("company_id", user.companyId)
        .is("saved_at", null);
      await supabase
        .from("search_history")
        .delete()
        .eq("id", searchId)
        .eq("company_id", user.companyId);
      return searchId;
    },
    onSuccess: (searchId) => {
      queryClient.setQueryData(['searchHistory', user?.companyId], (old: SearchHistory[] = []) => old.filter(h => h.id !== searchId));
    }
  });

  // Limpar todo o histórico: apaga search_history + leads NÃO salvos
  const clearAllHistoryMutation = useMutation({
    mutationFn: async () => {
      if (!user?.companyId) return;
      await supabase
        .from("leads")
        .delete()
        .eq("company_id", user.companyId)
        .is("saved_at", null);
      await supabase
        .from("search_history")
        .delete()
        .eq("company_id", user.companyId);
    },
    onSuccess: () => {
      queryClient.setQueryData(['searchHistory', user?.companyId], []);
    }
  });

  // --- Wrapper Functions ---

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

  const enrichEmails = async (leadIds: string[]) => {
    try {
      const data = await enrichEmailsMutation.mutateAsync(leadIds);
      return data.updated || [];
    } catch { return []; }
  };

  return {
    leads,
    searchHistory,
    isSearching,
    isLoading: isLoadingLeads,
    isEnrichingEmails: enrichEmailsMutation.isPending,
    isAddingManualLead: addManualLeadMutation.isPending,
    isSavingToBase: saveLeadsToBaseMutation.isPending,
    searchLeads,
    enrichEmails,
    addManualLead: addManualLeadMutation.mutateAsync,
    saveLeadsToBase: saveLeadsToBaseMutation.mutateAsync,
    deleteLead: (id: string) => deleteLeadMutation.mutate(id),
    clearAllLeads: () => clearAllLeadsMutation.mutate(),
    getLeadsBySearchId: (searchId: string) => leads.filter((l) => l.searchId === searchId),
    deleteSearchHistory: (id: string) => deleteSearchHistoryMutation.mutate(id),
    clearAllHistory: () => clearAllHistoryMutation.mutate(),
    refreshData: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  };
}
