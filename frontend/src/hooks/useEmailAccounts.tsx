import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ENABLE_CAMPAIGNS } from "@/lib/featureFlags";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export interface EmailAccount {
  id: string;
  name: string;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_use_tls: boolean;
  daily_limit: number;
  is_verified: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEmailAccountPayload {
  name: string;
  from_email: string;
  from_name?: string | null;
  reply_to?: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_use_tls: boolean;
  daily_limit: number;
}

export interface VerifyResult {
  success: boolean;
  error?: string | null;
  last_verified_at?: string | null;
}

/**
 * Hook que gerencia as contas SMTP do usuário (CRUD + verify).
 * As senhas só transitam no payload — backend encripta antes de gravar
 * e nunca devolve a senha em respostas.
 */
export function useEmailAccounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: accounts = [], isLoading, error } = useQuery<EmailAccount[]>({
    queryKey: ["email-accounts"],
    queryFn: async () => {
      const res = await apiGet(`${BACKEND_URL}/api/email-accounts`);
      if (!res.ok) {
        if (res.status === 401) throw new Error("Sessão expirada");
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return res.json();
    },
    staleTime: 1000 * 30,
    // Feature flag: quando ENABLE_CAMPAIGNS=false o endpoint retorna 404
    // (rota não registrada no backend). Evita request inútil + erro silencioso.
    enabled: ENABLE_CAMPAIGNS,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateEmailAccountPayload) => {
      const res = await apiPost(`${BACKEND_URL}/api/email-accounts`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return res.json() as Promise<EmailAccount>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      toast({
        title: "Conta SMTP salva",
        description: "Clique em 'Testar conexão' pra verificar.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`${BACKEND_URL}/api/email-accounts/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      toast({ title: "Conta deletada" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao deletar", description: e.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: string): Promise<VerifyResult> => {
      const res = await apiPost(`${BACKEND_URL}/api/email-accounts/${id}/verify`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      if (data.success) {
        toast({
          title: "Conexão OK ✅",
          description: "Servidor SMTP autenticou. Você já pode enviar campanhas.",
        });
      } else {
        toast({
          title: "Falha na conexão",
          description: data.error || "Erro desconhecido — verifique host, porta, usuário e senha.",
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  return {
    accounts,
    isLoading,
    error: error ? (error as Error).message : null,
    createAccount: createMutation.mutateAsync,
    deleteAccount: deleteMutation.mutateAsync,
    verifyAccount: verifyMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isVerifying: verifyMutation.isPending,
  };
}
