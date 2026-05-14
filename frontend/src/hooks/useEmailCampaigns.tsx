import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export type EmailCampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "paused"
  | "cancelled"
  | "failed";

export type EmailRecipientStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "unsubscribed"
  | "failed";

export interface EmailCampaign {
  id: string;
  company_id: string;
  user_id: string | null;
  email_account_id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  status: EmailCampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_recipients: number;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  unsubscribed_count: number;
  failed_count: number;
  interval_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface EmailRecipient {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  email: string;
  name: string | null;
  template_vars: Record<string, string> | null;
  status: EmailRecipientStatus;
  sent_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  click_count: number;
  bounce_reason: string | null;
  failure_reason: string | null;
  tracking_token: string;
  created_at: string;
}

export interface CreateCampaignPayload {
  name: string;
  subject: string;
  body_html: string;
  body_text?: string;
  email_account_id: string;
  interval_seconds: number;
}

interface CampaignListResponse {
  campaigns: EmailCampaign[];
  total: number;
  limit: number;
  offset: number;
}

interface RecipientsListResponse {
  recipients: EmailRecipient[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Hook principal de campanhas. Cobre o CRUD e as ações (send/pause/cancel).
 * O hook de recipients fica separado (useCampaignRecipients).
 */
export function useEmailCampaigns() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<CampaignListResponse>({
    queryKey: ["email-campaigns"],
    queryFn: async () => {
      const res = await apiGet(`${BACKEND_URL}/api/email-campaigns?limit=100`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return res.json();
    },
    staleTime: 1000 * 15,
    refetchInterval: 5000, // poll leve enquanto a tela estiver aberta (workers atualizam contadores)
    refetchIntervalInBackground: false,
  });

  const campaigns = data?.campaigns || [];

  // ─── Mutations ──

  const createMutation = useMutation({
    mutationFn: async (payload: CreateCampaignPayload) => {
      const res = await apiPost(`${BACKEND_URL}/api/email-campaigns`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return res.json() as Promise<EmailCampaign>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast({ title: "Campanha criada", description: "Agora adicione destinatários e clique em Enviar." });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao criar", description: e.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<CreateCampaignPayload> }) => {
      const res = await apiPut(`${BACKEND_URL}/api/email-campaigns/${id}`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast({ title: "Campanha atualizada" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`${BACKEND_URL}/api/email-campaigns/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast({ title: "Campanha deletada" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao deletar", description: e.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiPost(`${BACKEND_URL}/api/email-campaigns/${id}/send`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast({ title: "Disparou!", description: "O worker está enviando em background. Acompanhe os contadores." });
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível enviar", description: e.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiPost(`${BACKEND_URL}/api/email-campaigns/${id}/pause`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast({ title: "Campanha pausada" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiPost(`${BACKEND_URL}/api/email-campaigns/${id}/cancel`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast({ title: "Campanha cancelada" });
    },
  });

  const addRecipientsFromLeadsMutation = useMutation({
    mutationFn: async ({ campaignId, leadIds }: { campaignId: string; leadIds: string[] }) => {
      const res = await apiPost(
        `${BACKEND_URL}/api/email-campaigns/${campaignId}/recipients/from-leads`,
        { lead_ids: leadIds }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return res.json() as Promise<{ added: number; skipped: number; total_recipients: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast({
        title: "Destinatários adicionados",
        description: `${data.added} adicionados, ${data.skipped} pulados (duplicados ou sem email).`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  return {
    campaigns,
    isLoading,
    error: error ? (error as Error).message : null,
    createCampaign: createMutation.mutateAsync,
    updateCampaign: updateMutation.mutateAsync,
    deleteCampaign: deleteMutation.mutateAsync,
    sendCampaign: sendMutation.mutateAsync,
    pauseCampaign: pauseMutation.mutateAsync,
    cancelCampaign: cancelMutation.mutateAsync,
    addRecipientsFromLeads: addRecipientsFromLeadsMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isSending: sendMutation.isPending,
    isAddingRecipients: addRecipientsFromLeadsMutation.isPending,
  };
}

/** Hook separado pra fetch dos recipients de uma campanha específica. */
export function useCampaignRecipients(campaignId: string | null, status?: EmailRecipientStatus) {
  const { data, isLoading } = useQuery<RecipientsListResponse>({
    queryKey: ["email-campaign-recipients", campaignId, status],
    enabled: !!campaignId,
    queryFn: async () => {
      let url = `${BACKEND_URL}/api/email-campaigns/${campaignId}/recipients?limit=200`;
      if (status) url += `&status=${status}`;
      const res = await apiGet(url);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  return {
    recipients: data?.recipients || [],
    total: data?.total || 0,
    isLoading,
  };
}
