import { Lock, Crown, Rocket, AlertTriangle, Zap, Ban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { QuotaLimitModal } from "./QuotaLimitModal";

interface PlanBlockedOverlayProps {
  feature: 'disparador' | 'agente';
  currentPlan: string;
  requiredPlan: string;
  isExpired?: boolean;
  isSuspended?: boolean;
  expiresAt?: string | null;
}

const FEATURE_INFO = {
  disparador: {
    title: "Disparador WhatsApp",
    description: "Envie mensagens em massa para seus leads de forma automatizada",
    icon: Rocket,
    color: "orange",
  },
  agente: {
    title: "Agente de IA",
    description: "Automatize conversas com inteligência artificial no WhatsApp",
    icon: Zap,
    color: "purple",
  },
};

export function PlanBlockedOverlay({ 
  feature, 
  currentPlan, 
  requiredPlan, 
  isExpired = false,
  isSuspended = false,
  expiresAt 
}: PlanBlockedOverlayProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const info = FEATURE_INFO[feature];
  const Icon = info.icon;

  // Conta Suspensa
  if (isSuspended) {
    return (
      <>
        <div className="py-12 animate-fade-in">
          <Card className="max-w-2xl mx-auto shadow-lg border-red-300 bg-gradient-to-b from-red-50 to-white">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-red-100 p-4 mb-6">
                <Ban className="h-12 w-12 text-red-600" />
              </div>
              
              <Badge variant="destructive" className="mb-4">
                Conta Suspensa
              </Badge>
              
              <h2 className="text-2xl font-bold mb-2 text-slate-900">
                Sua Conta Está Suspensa 🚫
              </h2>
              
              <p className="text-muted-foreground mb-6 max-w-md">
                Seu acesso à plataforma foi suspenso. Isso pode ter ocorrido por cancelamento, 
                falta de pagamento ou outra razão administrativa.
              </p>

              <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-6 text-left w-full max-w-sm">
                <p className="text-sm font-medium mb-2 text-red-800">Para reativar sua conta:</p>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• Renove sua assinatura</li>
                  <li>• Entre em contato com o suporte</li>
                </ul>
              </div>

              <Button 
                size="lg"
                className="gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                onClick={() => setShowUpgradeModal(true)}
              >
                <Rocket className="h-5 w-5" />
                Ver Planos
              </Button>
            </CardContent>
          </Card>
        </div>
        
        <QuotaLimitModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
      </>
    );
  }

  // Plano Expirado
  if (isExpired) {
    return (
      <>
        <div className="py-12 animate-fade-in">
          <Card className="max-w-2xl mx-auto shadow-lg border-red-200 bg-gradient-to-b from-red-50 to-white">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-red-100 p-4 mb-6">
                <AlertTriangle className="h-12 w-12 text-red-600" />
              </div>
              
              <Badge variant="destructive" className="mb-4">
                Plano Expirado
              </Badge>
              
              <h2 className="text-2xl font-bold mb-2 text-slate-900">
                Seu Plano Expirou 😔
              </h2>
              
              <p className="text-muted-foreground mb-6 max-w-md">
                Seu acesso à plataforma foi suspenso pois seu plano expirou
                {expiresAt && (
                  <> em <strong>{new Date(expiresAt).toLocaleDateString('pt-BR')}</strong></>
                )}.
                Renove agora para continuar usando todas as funcionalidades.
              </p>

              <div className="bg-slate-100 p-4 rounded-lg mb-6 text-left w-full max-w-sm">
                <p className="text-sm font-medium mb-2 text-slate-600">Seu plano anterior:</p>
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-slate-400" />
                  <span className="font-bold text-slate-700">{currentPlan}</span>
                  <Badge variant="outline" className="text-red-600 border-red-200">
                    Expirado
                  </Badge>
                </div>
              </div>

              <Button 
                size="lg"
                className="gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                onClick={() => setShowUpgradeModal(true)}
              >
                <Rocket className="h-5 w-5" />
                Renovar Agora
              </Button>
            </CardContent>
          </Card>
        </div>
        
        <QuotaLimitModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
      </>
    );
  }

  // Feature Bloqueada por Plano
  return (
    <>
      <div className="py-12 animate-fade-in">
        <Card className="max-w-2xl mx-auto shadow-lg border-slate-200">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className={`rounded-full p-4 mb-6 ${
              info.color === 'orange' ? 'bg-orange-100' : 'bg-purple-100'
            }`}>
              <Lock className={`h-12 w-12 ${
                info.color === 'orange' ? 'text-orange-600' : 'text-purple-600'
              }`} />
            </div>
            
            <h2 className="text-2xl font-bold mb-2 text-slate-900">
              {info.title} Bloqueado 🔒
            </h2>
            
            <p className="text-muted-foreground mb-6 max-w-md">
              {info.description}. Esta funcionalidade está disponível a partir do plano{' '}
              <strong className={
                requiredPlan === 'intermediario' ? 'text-orange-600' : 'text-purple-600'
              }>
                {requiredPlan === 'intermediario' ? 'Intermediário' : 'Avançado'}
              </strong>.
            </p>

            <div className="bg-slate-50 p-4 rounded-lg mb-6 text-left w-full max-w-sm border border-slate-200">
              <p className="text-sm font-medium mb-2 text-slate-600">Seu plano atual:</p>
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                <span className="font-bold text-slate-800">{currentPlan}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                size="lg"
                className={`gap-2 ${
                  info.color === 'orange' 
                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700' 
                    : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700'
                }`}
                onClick={() => setShowUpgradeModal(true)}
              >
                <Icon className="h-5 w-5" />
                Fazer Upgrade
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-6">
              ✓ Acesso imediato • ✓ Cancele quando quiser • ✓ Garantia de 7 dias
            </p>
          </CardContent>
        </Card>
      </div>
      
      <QuotaLimitModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
    </>
  );
}
