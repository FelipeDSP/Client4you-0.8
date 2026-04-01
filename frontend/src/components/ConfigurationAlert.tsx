import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Settings, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

interface ConfigurationAlertProps {
  type: 'serp' | 'waha';
  onConfigure?: () => void;
}

export function ConfigurationAlert({ type, onConfigure }: ConfigurationAlertProps) {
  const config = {
    serp: {
      title: "SERP API não configurada",
      description: "Para buscar leads do Google Maps, você precisa configurar sua chave da SERP API.",
      icon: <AlertTriangle className="h-5 w-5" />,
      action: (
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Link to="/settings">
            <Button size="sm" className="gap-2">
              <Settings className="h-4 w-4" />
              Configurar SERP API
            </Button>
          </Link>
          <Button 
            size="sm" 
            variant="outline" 
            className="gap-2"
            onClick={() => window.open('https://serpapi.com/', '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
            Obter Chave SERP API
          </Button>
        </div>
      ),
      steps: [
        "1. Clique em 'Obter Chave SERP API' e crie sua conta",
        "2. Copie sua API Key do painel da SERP API",
        "3. Cole a chave em Configurações → SERP API",
        "4. Volte aqui e comece a buscar leads!"
      ]
    },
    waha: {
      title: "WhatsApp não conectado",
      description: "Para usar o Disparador de Mensagens, você precisa conectar seu WhatsApp.",
      icon: <AlertTriangle className="h-5 w-5" />,
      action: (
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Link to="/settings">
            <Button size="sm" className="gap-2">
              <Settings className="h-4 w-4" />
              Conectar WhatsApp
            </Button>
          </Link>
        </div>
      ),
      steps: [
        "1. Vá em Configurações → Gerenciar WhatsApp",
        "2. Clique em 'Iniciar Sessão'",
        "3. Escaneie o QR Code com seu WhatsApp",
        "4. Aguarde a conexão e volte aqui!"
      ]
    }
  };

  const selected = config[type];

  return (
    <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <div className="text-amber-600 dark:text-amber-500 mt-0.5">
          {selected.icon}
        </div>
        <div className="flex-1 space-y-2">
          <AlertTitle className="text-amber-900 dark:text-amber-100 text-base">
            {selected.title}
          </AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            {selected.description}
          </AlertDescription>
          
          {/* Steps */}
          <div className="space-y-1.5 text-sm text-amber-700 dark:text-amber-300">
            {selected.steps.map((step, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="font-medium">{step}</span>
              </div>
            ))}
          </div>
          
          {/* Action buttons */}
          {selected.action}
        </div>
      </div>
    </Alert>
  );
}
