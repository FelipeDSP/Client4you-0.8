import { useState } from "react";
import { TrendingUp, Zap, MessageCircle, Crown, AlertTriangle, RefreshCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuotas } from "@/hooks/useQuotas";
import { QuotaLimitModal } from "./QuotaLimitModal"; // Importamos o Modal

export function QuotaBar() {
  const { 
    quota, 
    isLoading, 
    error,
    refresh,
    hasUnlimitedLeads, 
    leadsPercentage, 
    isPlanExpired 
  } = useQuotas();

  // Estado para controlar se o popup está aberto ou fechado
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // 1. LOADING STATE
  if (isLoading) {
    return (
      <Card className="p-4 border-l-4 border-muted bg-white/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // 2. ERROR STATE
  if (error || !quota) {
    return (
      <Card className="p-4 border-l-4 border-red-400 bg-red-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">Erro ao carregar</span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refresh} 
            className="gap-2 border-red-200 text-red-700 hover:bg-red-100 bg-white"
          >
            <RefreshCcw className="h-3 w-3" />
            Recarregar
          </Button>
        </div>
      </Card>
    );
  }

  // 3. NORMAL STATE
  const getPlanColor = (planType: string) => {
    switch (planType) {
      case 'demo': return 'bg-gray-500';
      case 'pro': return 'bg-primary';
      case 'enterprise': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getPlanIcon = (planType: string) => {
    switch (planType) {
      case 'demo': return <Zap className="h-4 w-4" />;
      case 'pro': return <MessageCircle className="h-4 w-4" />;
      case 'enterprise': return <Crown className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  // Lógica: Mostrar botão se for Demo, ou se estiver perto do limite, ou se o plano expirou
  const shouldShowUpgrade = quota.plan_type === 'demo' || isPlanExpired; 
  const isNearLimit = !hasUnlimitedLeads && leadsPercentage >= 80;

  return (
    <>
      <Card className="p-4 border-l-4 border-primary animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge className={`${getPlanColor(quota.plan_type)} text-white hover:${getPlanColor(quota.plan_type)}`}>
              <span className="flex items-center gap-1">
                {getPlanIcon(quota.plan_type)}
                {quota.plan_name || 'Plano Demo'}
              </span>
            </Badge>
            
            {isPlanExpired && (
              <Badge variant="destructive" className="animate-pulse">
                Expirado
              </Badge>
            )}
          </div>

          {shouldShowUpgrade && (
            // Agora abre o modal ao invés de link externo
            <Button 
              size="sm" 
              onClick={() => setShowUpgradeModal(true)}
              className="h-8 shadow-sm bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white border-0"
            >
              <Crown className="mr-2 h-3 w-3" />
              Fazer Upgrade
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {/* Lead Searches */}
          <div>
            <div className="flex items-center justify-between mb-1 text-sm">
              <span className="text-muted-foreground font-medium">Buscas de Leads</span>
              <span className="font-bold text-gray-700">
                {hasUnlimitedLeads ? (
                  <span className="flex items-center gap-1">
                    <span className="text-primary">{quota.leads_used}</span>
                    <span className="text-muted-foreground font-normal">/</span>
                    <span className="text-primary text-lg leading-none">∞</span>
                  </span>
                ) : (
                  <>
                    <span className={isNearLimit ? "text-orange-600" : ""}>{quota.leads_used}</span>
                    <span className="text-muted-foreground font-normal"> / {quota.leads_limit}</span>
                  </>
                )}
              </span>
            </div>
            {!hasUnlimitedLeads && (
              <Progress 
                value={leadsPercentage} 
                className="h-2.5 bg-gray-100"
                indicatorClassName={isNearLimit ? "bg-orange-500 transition-all" : "bg-primary transition-all"}
              />
            )}
          </div>

          {/* Campaigns */}
          {quota.campaigns_limit !== 0 && (
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Campanhas</span>
                <span className="font-bold text-gray-700">
                  {quota.campaigns_limit === -1 ? (
                    <span className="flex items-center gap-1">
                      <span className="text-primary">{quota.campaigns_used}</span>
                      <span className="text-muted-foreground font-normal">/</span>
                      <span className="text-primary text-lg leading-none">∞</span>
                    </span>
                  ) : (
                    <>
                      <span>{quota.campaigns_used}</span>
                      <span className="text-muted-foreground font-normal"> / {quota.campaigns_limit}</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Expires Info for Demo */}
          {quota.plan_expires_at && !isPlanExpired && (
            <div className="pt-1 mt-1 border-t border-dashed border-gray-100">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-gray-400" />
                Expira em: <span className="font-medium text-gray-600">{new Date(quota.plan_expires_at).toLocaleDateString('pt-BR')}</span>
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* O componente do Modal fica aqui, invisível até ser chamado */}
      <QuotaLimitModal 
        open={showUpgradeModal} 
        onOpenChange={setShowUpgradeModal} 
      />
    </>
  );
}