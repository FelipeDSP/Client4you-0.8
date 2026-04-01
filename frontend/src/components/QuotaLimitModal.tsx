import { AlertCircle, Check, Crown, Rocket, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface QuotaLimitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuotaLimitModal({ 
  open, 
  onOpenChange
}: QuotaLimitModalProps) {
  
  // URLs do Kiwify - Links de pagamento
  const KIWIFY_BASICO_URL = "https://pay.kiwify.com.br/FzhyShi";
  const KIWIFY_INTERMEDIARIO_URL = "https://pay.kiwify.com.br/YlIDqCN";
  const KIWIFY_AVANCADO_URL = "https://pay.kiwify.com.br/TnUQl3f";

  const handleUpgrade = (planUrl: string) => {
    window.open(planUrl, '_blank');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto bg-slate-50">
        <DialogHeader className="pt-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-200">
            <Rocket className="h-8 w-8 text-white" />
          </div>
          <DialogTitle className="text-center text-3xl font-bold text-slate-900">
            Escolha o Plano Ideal 🚀
          </DialogTitle>
          <DialogDescription className="text-center text-lg text-slate-600 max-w-2xl mx-auto">
            Desbloqueie mais leads, disparos ilimitados e recursos exclusivos de IA para escalar sua operação.
          </DialogDescription>
        </DialogHeader>

        {/* Planos */}
        <div className="grid md:grid-cols-3 gap-6 py-6 px-2">
          
          {/* PLANO BÁSICO */}
          <Card className="relative overflow-hidden border border-slate-200 hover:border-blue-400 hover:shadow-xl transition-all duration-300 bg-white group">
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                    <Zap className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Básico</h3>
                </div>
                <p className="text-sm text-slate-500">Para quem está começando</p>
                <div className="flex items-baseline justify-center gap-1 pt-2">
                  <span className="text-4xl font-extrabold text-slate-900">R$ 39,90</span>
                  <span className="text-slate-500 font-medium">/mês</span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-100 p-0.5">
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-slate-700"><strong>Extrator de Leads</strong> Ilimitado</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-100 p-0.5">
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-slate-700">Exportar para Excel/CSV</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-100 p-0.5">
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-slate-700">Histórico de buscas</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-100 p-0.5">
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-slate-700">Suporte por email</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <span className="w-4 text-center text-lg leading-none">−</span>
                  <span>Disparador WhatsApp</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <span className="w-4 text-center text-lg leading-none">−</span>
                  <span>Agente IA</span>
                </div>
              </div>

              {/* CTA */}
              <Button 
                variant="outline"
                className="w-full h-11 font-semibold border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                onClick={() => handleUpgrade(KIWIFY_BASICO_URL)}
              >
                Assinar Básico
              </Button>
            </div>
          </Card>

          {/* PLANO INTERMEDIÁRIO - MAIS POPULAR */}
          <Card className="relative overflow-hidden border-2 border-orange-500 shadow-2xl scale-105 z-10 bg-white">
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-center shadow-sm">
              ⭐ Mais Popular
            </div>
            
            <div className="p-6 pt-12 space-y-6">
              {/* Header */}
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
                    <Rocket className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Intermediário</h3>
                </div>
                <p className="text-sm text-slate-500">Para escalar vendas</p>
                <div className="flex items-baseline justify-center gap-1 pt-2">
                  <span className="text-4xl font-extrabold text-slate-900">R$ 99,90</span>
                  <span className="text-slate-500 font-medium">/mês</span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-100 p-0.5">
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-slate-700 font-medium">Tudo do plano Básico</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-100 p-0.5">
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-slate-700"><strong>Disparador WhatsApp</strong> Ilimitado</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-100 p-0.5">
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-slate-700">Conexão via QR Code</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-100 p-0.5">
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-slate-700">Importação de listas</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-green-100 p-0.5">
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-slate-700">Agendamento de disparos</span>
                </div>
              </div>

              {/* CTA */}
              <Button 
                className="w-full h-11 font-bold bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-md shadow-orange-200 transition-all hover:scale-[1.02]"
                onClick={() => handleUpgrade(KIWIFY_INTERMEDIARIO_URL)}
              >
                Assinar Intermediário
              </Button>
            </div>
          </Card>

          {/* PLANO AVANÇADO */}
          <Card className="relative overflow-hidden border border-purple-200 hover:border-purple-400 hover:shadow-xl transition-all duration-300 bg-gradient-to-b from-purple-50/50 to-white group">
            <div className="absolute top-0 right-0 bg-purple-600 text-white px-3 py-1 text-[10px] font-bold uppercase rounded-bl-lg shadow-sm">
              IA Inclusa
            </div>
            
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-600 group-hover:bg-purple-200 transition-colors">
                    <Crown className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Avançado</h3>
                </div>
                <p className="text-sm text-slate-500">Automação Completa</p>
                <div className="flex items-baseline justify-center gap-1 pt-2">
                  <span className="text-4xl font-extrabold text-slate-900">R$ 199,90</span>
                  <span className="text-slate-500 font-medium">/mês</span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-purple-100 p-0.5">
                    <Check className="h-3 w-3 text-purple-600" />
                  </div>
                  <span className="text-slate-700 font-medium">Tudo do plano Intermediário</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-purple-100 p-0.5">
                    <Check className="h-3 w-3 text-purple-600" />
                  </div>
                  <span className="text-slate-700"><strong>Agente de IA</strong> incluso</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-purple-100 p-0.5">
                    <Check className="h-3 w-3 text-purple-600" />
                  </div>
                  <span className="text-slate-700">Qualificação automática</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-purple-100 p-0.5">
                    <Check className="h-3 w-3 text-purple-600" />
                  </div>
                  <span className="text-slate-700">Múltiplos números</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-purple-100 p-0.5">
                    <Check className="h-3 w-3 text-purple-600" />
                  </div>
                  <span className="text-slate-700">Suporte VIP WhatsApp</span>
                </div>
              </div>

              {/* CTA */}
              <Button 
                className="w-full h-11 font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-200"
                onClick={() => handleUpgrade(KIWIFY_AVANCADO_URL)}
              >
                Assinar Avançado
              </Button>
            </div>
          </Card>
        </div>

        {/* Garantia */}
        <div className="text-center space-y-3 pb-6 border-t border-slate-100 pt-6 bg-slate-50/50">
          <Badge variant="outline" className="text-slate-500 bg-white border-slate-200 font-normal">
            🔒 Pagamento 100% Seguro via Kiwify
          </Badge>
          <div className="flex justify-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> Garantia de 7 dias</span>
            <span className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> Cancelamento fácil</span>
            <span className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> Acesso imediato</span>
          </div>
        </div>

        {/* Fechar */}
        <div className="p-4 pt-0">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="w-full text-slate-400 hover:text-slate-600"
          >
            Talvez depois
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}