import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  isDemo?: boolean;
  leadsLimit: number | null; // null = unlimited
  features: {
    name: string;
    included: boolean;
    limit?: string;
  }[];
}

interface Subscription {
  id: string;
  companyId: string;
  planId: string;
  status: string;
  demoUsed: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SubscriptionContextType {
  subscription: Subscription | null;
  currentPlan: SubscriptionPlan;
  isLoading: boolean;
  demoUsed: boolean;
  setDemoUsed: () => Promise<void>;
  changePlan: (planId: string) => Promise<boolean>;
  refreshSubscription: () => Promise<void>;
}

export const plans: SubscriptionPlan[] = [
  {
    id: "demo",
    name: "Demo",
    description: "Teste grátis por 7 dias",
    price: 0,
    isDemo: true,
    leadsLimit: 5,
    features: [
      { name: "Extrator de Leads", included: true, limit: "5 buscas" },
      { name: "Exportar para Excel", included: true },
      { name: "Disparador WhatsApp", included: true, limit: "1 campanha teste" },
      { name: "Válido por 7 dias", included: true },
    ],
  },
  {
    id: "basico",
    name: "Básico",
    description: "Ideal para começar",
    price: 39.90,
    leadsLimit: null, // unlimited
    features: [
      { name: "Extrator de Leads", included: true, limit: "Ilimitado" },
      { name: "Exportar para Excel/CSV", included: true },
      { name: "Histórico de buscas", included: true },
      { name: "Suporte por email", included: true },
      { name: "Disparador WhatsApp", included: false },
      { name: "Agente IA", included: false },
    ],
  },
  {
    id: "intermediario",
    name: "Intermediário",
    description: "Para profissionais e pequenas empresas",
    price: 99.90,
    leadsLimit: null, // unlimited
    features: [
      { name: "Tudo do plano Básico", included: true },
      { name: "Disparador de Campanhas WhatsApp", included: true, limit: "Ilimitado" },
      { name: "Conexão WhatsApp automatizada", included: true },
      { name: "Upload de listas de contatos", included: true },
      { name: "Agendamento de mensagens", included: true },
      { name: "Suporte prioritário", included: true },
    ],
  },
  {
    id: "avancado",
    name: "Avançado",
    description: "Solução completa com IA",
    price: 199.90,
    leadsLimit: null, // unlimited
    features: [
      { name: "Tudo do plano Intermediário", included: true },
      { name: "Agente de IA Personalizado", included: true, limit: "Em breve" },
      { name: "Automações avançadas com IA", included: true },
      { name: "Respostas automáticas inteligentes", included: true },
      { name: "Múltiplas instâncias WhatsApp", included: true },
      { name: "API de integração", included: true },
      { name: "Suporte dedicado", included: true },
    ],
  },
];

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (!user?.companyId) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("company_id", user.companyId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching subscription:", error);
        setSubscription(null);
      } else if (data) {
        setSubscription({
          id: data.id,
          companyId: data.company_id,
          planId: data.plan_id,
          status: data.status,
          demoUsed: data.demo_used || false,
          currentPeriodStart: data.current_period_start,
          currentPeriodEnd: data.current_period_end,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        });
      } else {
        setSubscription(null);
      }
    } catch (error) {
      console.error("Error fetching subscription:", error);
      setSubscription(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.companyId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const currentPlan = plans.find((p) => p.id === subscription?.planId) || plans[0];
  const demoUsed = subscription?.demoUsed || false;

  const setDemoUsed = async () => {
    if (!subscription?.id) return;

    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ demo_used: true })
        .eq("id", subscription.id);

      if (error) {
        console.error("Error setting demo used:", error);
        return;
      }

      setSubscription((prev) => prev ? { ...prev, demoUsed: true } : null);
    } catch (error) {
      console.error("Error setting demo used:", error);
    }
  };

  const changePlan = async (planId: string): Promise<boolean> => {
    if (!subscription?.id) return false;

    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ 
          plan_id: planId,
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", subscription.id);

      if (error) {
        console.error("Error changing plan:", error);
        return false;
      }

      await fetchSubscription();
      return true;
    } catch (error) {
      console.error("Error changing plan:", error);
      return false;
    }
  };

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        currentPlan,
        isLoading,
        demoUsed,
        setDemoUsed,
        changePlan,
        refreshSubscription: fetchSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
}
