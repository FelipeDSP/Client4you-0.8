import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lead, SearchHistory } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { makeAuthenticatedRequest } from "@/lib/api";

const API_URL = import.meta.env.VITE_BACKEND_URL || "";

// PR 6: polling do batch async em /enrich-emails/status/{batch_id}
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 150; // 5 min com intervalo de 2s

export interface EnrichmentProgress {
  batchId: string;
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  done: boolean;
  force: boolean;
}

export interface EnrichmentJobResult {
  lead_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result_email: string | null;
  result_source: string | null;
  result_confidence: number | null;
  result_cached: boolean;
  result_cost_usd: number;
  error: string | null;
}

export class QuotaExhaustedError extends Error {
  detail: {
    reason: string;
    action: "email_enrich" | "reenrich";
    limit: number;
    used: number;
    requested: number;
  };
  constructor(detail: QuotaExhaustedError["detail"]) {
    super(detail.reason);
    this.name = "QuotaExhaustedError";
    this.detail = detail;
  }
}

export interface SearchResult {
  leads: Lead[];
  hasMore: boolean;
  nextStart: number;
  searchId: string;
  query: string;
  location: string;
}

/** Espera N ms (resolução do setTimeout). */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));


export function useLeads() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSearching, setIsSearching] = useState(false);

  // PR 6: progresso do batch async (pra UI de barra/contador)
  const [enrichmentProgress, setEnrichmentProgress] =
    useState<EnrichmentProgress | null>(null);

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
        lat: lead.latitude ?? null,
        lng: lead.longitude ?? null,
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

  // --- 3. MUTATION: Buscar Leads (server-side via backend FastAPI) ---
  // O backend chama o DataForSEO, aplica a quota no servidor (não dá pra
  // burlar pelo cliente), insere os leads como transitórios (saved_at NULL) e
  // devolve os leads já mapeados. Sem paginação: o DataForSEO retorna tudo
  // numa chamada só, então hasMore é sempre false.
  const searchMutation = useMutation({
    mutationFn: async ({ query, location, limit, existingSearchId }: { query: string, location: string, limit?: number | null, existingSearchId?: string }): Promise<SearchResult | null> => {
      if (!user?.companyId) return null;

      const response = await makeAuthenticatedRequest(`${API_URL}/api/leads/search`, {
        method: "POST",
        body: JSON.stringify({
          query,
          location,
          limit: limit ?? null,
          search_id: existingSearchId ?? null,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${response.status} na busca`);
      }

      const data = await response.json();

      // O backend já devolve os leads no shape do TS Lead.
      const newLeadsMapped: Lead[] = (data.leads || []) as Lead[];

      return {
        leads: newLeadsMapped,
        hasMore: false,
        nextStart: 0,
        searchId: data.searchId,
        query,
        location,
      };
    },
    onSuccess: () => {
      // Resultados de busca são transitórios (não entram na Base de Leads).
      // Só invalida o histórico pra refletir a nova busca/contagem.
      queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
    },
    onError: (error) => {
      console.error("Erro na busca:", error);
    }
  });

  // --- 4. MUTATION: Enriquecer emails via cascata async + polling ---
  // PR 6: migrou de POST /enrich-emails síncrono pra POST /enrich-emails/async
  // + polling em GET /enrich-emails/status/{batch_id}. Aceita force=true (botão
  // "Reenriquecer") que vai pra sub-quota separada e bypassa cache.
  const enrichEmailsMutation = useMutation({
    mutationFn: async (args: { leadIds: string[]; force?: boolean }) => {
      const { leadIds, force = false } = args;
      if (leadIds.length === 0) return { updated: [], failed: [], cache_hits: 0 };

      // (1) Dispara batch
      const startResp = await makeAuthenticatedRequest(
        `${API_URL}/api/leads/enrich-emails/async`,
        {
          method: "POST",
          body: JSON.stringify({ lead_ids: leadIds, force }),
        }
      );

      if (startResp.status === 402) {
        const body = await startResp.json().catch(() => ({}));
        const detail = body?.detail ?? body;
        throw new QuotaExhaustedError({
          reason: detail?.reason ?? "Limite atingido",
          action: detail?.action ?? (force ? "reenrich" : "email_enrich"),
          limit: detail?.limit ?? 0,
          used: detail?.used ?? 0,
          requested: detail?.requested ?? leadIds.length,
        });
      }
      if (!startResp.ok) {
        const err = await startResp.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${startResp.status}`);
      }

      const startData = await startResp.json();
      const batchId: string = startData.batch_id;
      const total: number = startData.total;

      setEnrichmentProgress({
        batchId,
        total,
        pending: total,
        processing: 0,
        completed: 0,
        failed: 0,
        done: false,
        force,
      });

      // (2) Polling de status
      try {
        for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
          await sleep(POLL_INTERVAL_MS);
          const statusResp = await makeAuthenticatedRequest(
            `${API_URL}/api/leads/enrich-emails/status/${batchId}`
          );
          if (!statusResp.ok) {
            if (statusResp.status === 404) {
              throw new Error("Batch não encontrado (pode ter sido limpo)");
            }
            continue; // erro transitório — tenta de novo na próxima
          }
          const status = await statusResp.json();
          setEnrichmentProgress({
            batchId,
            total: status.total,
            pending: status.pending,
            processing: status.processing,
            completed: status.completed,
            failed: status.failed,
            done: status.done,
            force,
          });
          if (status.done) break;
        }

        // (3) Pega resultados completos pra atualizar UI
        const finalResp = await makeAuthenticatedRequest(
          `${API_URL}/api/leads/enrich-emails/status/${batchId}?include_jobs=true`
        );
        if (!finalResp.ok) {
          throw new Error("Falha ao buscar resultados finais do batch");
        }
        const finalData = await finalResp.json();
        const jobs: EnrichmentJobResult[] = finalData.jobs || [];

        const updated = jobs
          .filter((j) => j.status === "completed")
          .map((j) => ({
            id: j.lead_id,
            email: j.result_email,
            source: j.result_source,
            confidence: j.result_confidence,
            cached: j.result_cached,
          }));
        const failed = jobs
          .filter((j) => j.status === "failed")
          .map((j) => ({ id: j.lead_id, error: j.error }));
        const cache_hits = updated.filter((u) => u.cached).length;

        return { batch_id: batchId, total, updated, failed, cache_hits };
      } finally {
        setEnrichmentProgress(null);
      }
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
    onError: () => {
      // Garante limpeza do progresso mesmo se polling der erro / quota 402
      setEnrichmentProgress(null);
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
  // Dedup por nome+endereço: uma nova busca cria novas linhas (search_id novo),
  // então a mesma empresa pode reaparecer. Aqui só salvamos as que ainda NÃO
  // estão na Base — evita duplicar quando o usuário salva de buscas diferentes.
  const saveLeadsToBaseMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const empty = { saved: 0, skipped: 0, baseLeadIds: [] as string[] };
      if (!user?.companyId || leadIds.length === 0) return empty;
      const companyId = user.companyId;

      // Chave de identidade: nome + endereço, normalizados
      const keyOf = (name?: string | null, address?: string | null) =>
        `${(name || "").trim().toLowerCase()}|${(address || "").trim().toLowerCase()}`;

      // 1) Leads já na Base (salvos) → mapeia chave → id da linha da base
      const { data: baseRows, error: baseErr } = await supabase
        .from("leads")
        .select("id, name, address")
        .eq("company_id", companyId)
        .not("saved_at", "is", null);
      if (baseErr) throw baseErr;
      const keyToBaseId = new Map<string, string>();
      for (const r of (baseRows || []) as any[]) {
        const k = keyOf(r.name, r.address);
        if (!keyToBaseId.has(k)) keyToBaseId.set(k, r.id);
      }

      // 2) Dados dos candidatos selecionados (só os transitórios ainda não salvos)
      const { data: candidates, error: candErr } = await supabase
        .from("leads")
        .select("id, name, address")
        .in("id", leadIds)
        .eq("company_id", companyId)
        .is("saved_at", null);
      if (candErr) throw candErr;

      // 3) Filtra: pula os que já estão na Base (ou repetidos no lote), mas
      // registra o id da base correspondente pra vincular a segmento/etiqueta.
      const seen = new Map(keyToBaseId); // chave → id da base (cresce no lote)
      const toSave: string[] = [];
      const baseLeadIds: string[] = [];
      for (const c of (candidates || []) as any[]) {
        const k = keyOf(c.name, c.address);
        const existing = seen.get(k);
        if (existing) {
          baseLeadIds.push(existing); // já na base → usa a linha existente
          continue;
        }
        seen.set(k, c.id); // esta linha passa a ser a da base
        toSave.push(c.id);
        baseLeadIds.push(c.id);
      }
      const skipped = leadIds.length - toSave.length;

      // 4) Salva só os novos
      if (toSave.length > 0) {
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from("leads")
          .update({ saved_at: nowIso } as any)
          .in("id", toSave)
          .eq("company_id", companyId)
          .is("saved_at", null);
        if (error) throw error;
      }

      // Dedup: mesma linha da base pode aparecer 2x se duas candidatas colidirem
      return { saved: toSave.length, skipped, baseLeadIds: Array.from(new Set(baseLeadIds)) };
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

  const searchLeads = async (query: string, location: string, limit?: number | null, existingSearchId?: string) => {
    setIsSearching(true);
    try {
      const result = await searchMutation.mutateAsync({ query, location, limit, existingSearchId });
      return result;
    } catch (e) {
      // Propaga pra UI poder mostrar o motivo (quota, config, etc.)
      throw e;
    } finally {
      setIsSearching(false);
    }
  };

  // PR 6: `force` opcional dispara o fluxo de reenriquecimento (sub-quota
  // separada). Erro de quota (402) propaga via QuotaExhaustedError pra caller
  // decidir UX (toast vs modal de upgrade); outros erros silenciam pra []
  // (mantém comportamento legado dos chamadores que não tratam erro).
  const enrichEmails = async (
    leadIds: string[],
    options: { force?: boolean } = {}
  ) => {
    try {
      const data = await enrichEmailsMutation.mutateAsync({
        leadIds,
        force: options.force,
      });
      return data.updated || [];
    } catch (e) {
      if (e instanceof QuotaExhaustedError) throw e;
      return [];
    }
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
    enrichmentProgress,
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
