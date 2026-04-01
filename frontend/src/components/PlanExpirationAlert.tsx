import { AlertTriangle, Clock, Crown, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { QuotaLimitModal } from "./QuotaLimitModal";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";

export function PlanExpirationAlert() {
  const { permissions } = usePlanPermissions();
  const [dismissed, setDismissed] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Não mostrar se não tem data de expiração ou se foi dispensado
  if (!permissions.expiresAt || dismissed) return null;

  // Não mostrar se já expirou (vai mostrar o bloqueio nas páginas)
  if (permissions.isPlanExpired) return null;

  // Só mostrar se faltam 7 dias ou menos
  const daysLeft = permissions.daysUntilExpiration;
  if (!daysLeft || daysLeft > 7) return null;

  const isUrgent = daysLeft <= 3;
  const expirationDate = new Date(permissions.expiresAt).toLocaleDateString('pt-BR');

  return (
    <>
      <Alert 
        className={`mb-6 border-2 ${
          isUrgent 
            ? 'border-red-300 bg-red-50' 
            : 'border-amber-300 bg-amber-50'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {isUrgent ? (
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            ) : (
              <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
            )}
            <div>
              <AlertTitle className={`font-semibold ${isUrgent ? 'text-red-800' : 'text-amber-800'}`}>
                {isUrgent 
                  ? `⚠️ Seu plano expira em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}!` 
                  : `Seu plano expira em ${daysLeft} dias`
                }
              </AlertTitle>
              <AlertDescription className={`mt-1 ${isUrgent ? 'text-red-700' : 'text-amber-700'}`}>
                O plano <strong>{permissions.planName}</strong> expira em{' '}
                <strong>{expirationDate}</strong>. Renove agora para não perder acesso às funcionalidades.
              </AlertDescription>
              <Button 
                size="sm" 
                className={`mt-3 gap-2 ${
                  isUrgent 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
                onClick={() => setShowUpgradeModal(true)}
              >
                <Crown className="h-4 w-4" />
                Renovar Agora
              </Button>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon"
            className={`h-8 w-8 ${isUrgent ? 'text-red-400 hover:text-red-600' : 'text-amber-400 hover:text-amber-600'}`}
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
      
      <QuotaLimitModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
    </>
  );
}
