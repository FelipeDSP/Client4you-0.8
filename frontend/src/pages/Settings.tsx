import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Globe, 
  MessageCircle, 
  Smartphone, 
  Loader2, 
  QrCode, 
  Power, 
  LogOut, 
  RefreshCw, 
  Settings as SettingsIcon,
  AlertTriangle,
  CheckCircle2,
  Info,
  Shield,
  Zap,
  Clock,
  Ban,
  Lightbulb,
  ShieldAlert,
  FileWarning
} from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { supabase } from "@/integrations/supabase/client";

// URL do backend a partir de variável de ambiente
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL || '';

// Helper para fazer requisições autenticadas
const createAuthenticatedApi = () => ({
  get: async (url: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const response = await fetch(`${BACKEND_URL}/api${url}`, { headers });
    return response.json();
  },
  post: async (url: string, body?: unknown) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const response = await fetch(`${BACKEND_URL}/api${url}`, { 
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    return response.json();
  }
});

type WAStatus = "LOADING" | "DISCONNECTED" | "STARTING" | "SCANNING" | "CONNECTED";

// Componente de Status Badge
const StatusBadge = ({ status }: { status: WAStatus }) => {
  const config = {
    LOADING: { label: "Carregando...", variant: "secondary" as const, className: "bg-gray-100 text-gray-600" },
    DISCONNECTED: { label: "Desconectado", variant: "destructive" as const, className: "bg-red-100 text-red-700" },
    STARTING: { label: "Iniciando...", variant: "secondary" as const, className: "bg-blue-100 text-blue-700" },
    SCANNING: { label: "Aguardando QR", variant: "secondary" as const, className: "bg-yellow-100 text-yellow-700" },
    CONNECTED: { label: "Conectado", variant: "default" as const, className: "bg-green-100 text-green-700" }
  };
  
  const { label, className } = config[status];
  return <Badge className={className}>{label}</Badge>;
};

// Componente de Passo do Guia
const GuideStep = ({ number, title, description, active }: { number: number; title: string; description: string; active: boolean }) => (
  <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${active ? 'bg-blue-50 border border-blue-200' : 'opacity-60'}`}>
    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
      {number}
    </div>
    <div>
      <p className={`font-medium ${active ? 'text-blue-900' : 'text-gray-500'}`}>{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  </div>
);

export default function Settings() {
  const { setPageTitle } = usePageTitle();
  const api = createAuthenticatedApi();
  
  useEffect(() => {
    setPageTitle("Configurações", SettingsIcon);
  }, [setPageTitle]);

  const { settings, saveSettings, hasSerpapiKey, isSaving } = useCompanySettings();
  const { user } = useAuth();
  const { toast } = useToast();

  const [serpapiKey, setSerpapiKey] = useState("");
  const [isSavingSerp, setIsSavingSerp] = useState(false);
  
  // Estados do Painel WhatsApp
  const [waStatus, setWaStatus] = useState<WAStatus>("LOADING");
  const [qrCode, setQrCode] = useState<string>("");
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  // Estado de aceitação dos termos de risco do WhatsApp
  const [hasAcceptedRisks, setHasAcceptedRisks] = useState<boolean>(() => {
    const saved = localStorage.getItem(`whatsapp_risks_accepted_${user?.id}`);
    return saved === 'true';
  });
  const [riskCheckbox, setRiskCheckbox] = useState(false);

  useEffect(() => {
    if (settings) {
        if (settings.serpapiKey) setSerpapiKey(settings.serpapiKey);
    }
  }, [settings]);

  // Polling de Status do WhatsApp
  useEffect(() => {
    if (!user?.companyId) return;
    
    const checkStatus = async () => {
      try {
        const res = await api.get(`/whatsapp/status`);
        setWaStatus(res.status || "DISCONNECTED");
        
        if (res.status === "SCANNING" && !qrCode) {
          fetchQR();
        } else if (res.status !== "SCANNING") {
          setQrCode("");
        }
      } catch (e) {
        console.error("Erro ao checar status:", e);
        setWaStatus("DISCONNECTED");
      }
    };

    const interval = setInterval(checkStatus, 5000);
    checkStatus();
    return () => clearInterval(interval);
  }, [user?.companyId, qrCode]);

  const fetchQR = async () => {
    try {
      const res = await api.get(`/whatsapp/qr`);
      if (res.image) setQrCode(res.image);
    } catch (e) { console.error("Erro ao buscar QR:", e); }
  };

  // Ações do Painel WhatsApp
  const handleStartSession = async () => {
    setIsActionLoading(true);
    try {
      await api.post(`/whatsapp/session/start`);
      toast({ title: "Iniciando sessão", description: "Aguarde enquanto o WhatsApp é iniciado..." });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível iniciar a sessão." });
    } finally { setIsActionLoading(false); }
  };

  const handleStopSession = async () => {
    setIsActionLoading(true);
    try {
      await api.post(`/whatsapp/session/stop`);
      toast({ title: "Sessão pausada", description: "O motor do WhatsApp foi desligado." });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível pausar a sessão." });
    } finally { setIsActionLoading(false); }
  };

  const handleLogout = async () => {
    if(!confirm("⚠️ Atenção!\n\nIsso irá desconectar seu WhatsApp e você precisará escanear um novo QR Code.\n\nDeseja continuar?")) return;
    setIsActionLoading(true);
    try {
      await api.post(`/whatsapp/session/logout`);
      toast({ title: "WhatsApp desconectado", description: "Você precisará escanear um novo QR Code para reconectar." });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível desconectar." });
    } finally { setIsActionLoading(false); }
  };

  // Handler para salvar chave SERP API
  const handleSaveSerpapiKey = async () => {
    if (!serpapiKey.trim()) {
      toast({ variant: "destructive", title: "Campo obrigatório", description: "Por favor, insira uma chave válida." });
      return;
    }

    setIsSavingSerp(true);
    try {
      const success = await saveSettings({ serpapiKey: serpapiKey.trim() });
      if (success) {
        toast({ title: "Chave salva!", description: "Sua chave SERP API foi configurada com sucesso." });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível salvar a chave." });
    } finally {
      setIsSavingSerp(false);
    }
  };

  // Determinar qual passo está ativo no guia
  const getCurrentStep = () => {
    if (waStatus === "DISCONNECTED") return 1;
    if (waStatus === "STARTING") return 2;
    if (waStatus === "SCANNING") return 3;
    if (waStatus === "CONNECTED") return 4;
    return 1;
  };

  // Função para aceitar os riscos
  const handleAcceptRisks = () => {
    if (riskCheckbox) {
      setHasAcceptedRisks(true);
      localStorage.setItem(`whatsapp_risks_accepted_${user?.id}`, 'true');
      toast({ 
        title: "Termos aceitos", 
        description: "Você agora pode configurar a conexão do WhatsApp." 
      });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
        <p className="text-muted-foreground">Gerencie conexões e preferências da sua conta.</p>
      </div>

      {/* Tabs de Configuração */}
      <Tabs defaultValue="whatsapp" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Globe className="h-4 w-4" />
            Integrações
          </TabsTrigger>
        </TabsList>

        {/* ========== TAB WHATSAPP ========== */}
        <TabsContent value="whatsapp" className="space-y-6">
          
          {/* Tela de Aceitação de Riscos - Mostrada apenas se ainda não aceitou */}
          {!hasAcceptedRisks ? (
            <Card className="border-amber-200 bg-gradient-to-b from-amber-50 to-white">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto bg-amber-100 p-4 rounded-full w-fit mb-4">
                  <ShieldAlert className="h-12 w-12 text-amber-600" />
                </div>
                <CardTitle className="text-2xl text-amber-900">Aviso Importante</CardTitle>
                <CardDescription className="text-amber-700 text-base">
                  Leia atentamente antes de prosseguir
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6 max-w-2xl mx-auto">
                {/* Lista de Avisos */}
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-amber-200">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-900">Conexão Não-Oficial</p>
                      <p className="text-sm text-amber-700">
                        Este sistema utiliza uma conexão <strong>não-oficial</strong> com o WhatsApp. 
                        Não somos parceiros, afiliados ou autorizados pelo WhatsApp/Meta.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-amber-200">
                    <Ban className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-900">Risco de Bloqueio</p>
                      <p className="text-sm text-amber-700">
                        O uso excessivo, abusivo ou em desacordo com os termos de uso do WhatsApp pode 
                        resultar em <strong>bloqueio temporário ou permanente</strong> do seu número de telefone.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-amber-200">
                    <FileWarning className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-900">Sua Responsabilidade</p>
                      <p className="text-sm text-amber-700">
                        Ao utilizar este recurso, você assume <strong>total responsabilidade</strong> pelo 
                        uso da ferramenta e pelas consequências que possam ocorrer, incluindo bloqueios.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dicas para evitar bloqueio */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="font-medium text-blue-800 flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4" />
                    Dicas para evitar problemas:
                  </p>
                  <ul className="text-sm text-blue-700 space-y-1 ml-6 list-disc">
                    <li>Use intervalos de 30-60 segundos entre mensagens</li>
                    <li>Limite a 100-200 mensagens por dia para números novos</li>
                    <li>Evite mensagens idênticas em massa</li>
                    <li>Não envie para números desconhecidos em excesso</li>
                  </ul>
                </div>

                {/* Checkbox e Botão de Aceitar */}
                <div className="border-t pt-6 space-y-4">
                  <div className="flex items-start space-x-3">
                    <Checkbox 
                      id="accept-risks" 
                      checked={riskCheckbox}
                      onCheckedChange={(checked) => setRiskCheckbox(checked === true)}
                      className="mt-1"
                    />
                    <label 
                      htmlFor="accept-risks" 
                      className="text-sm text-gray-700 cursor-pointer leading-relaxed"
                    >
                      <strong>Eu li e compreendo os riscos.</strong> Estou ciente de que esta é uma conexão 
                      não-oficial e que o uso inadequado pode resultar no bloqueio do meu número de WhatsApp. 
                      Assumo total responsabilidade pelo uso desta ferramenta.
                    </label>
                  </div>
                  
                  <Button 
                    onClick={handleAcceptRisks}
                    disabled={!riskCheckbox}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    size="lg"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Entendi e desejo continuar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
              /* Card Principal WhatsApp */
              <div className="grid gap-6 lg:grid-cols-3">
                
                {/* Coluna do Status e Controle */}
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${waStatus === 'CONNECTED' ? 'bg-green-100' : 'bg-gray-100'}`}>
                            <Smartphone className={`h-5 w-5 ${waStatus === 'CONNECTED' ? 'text-green-600' : 'text-gray-500'}`} />
                          </div>
                          <div>
                            <CardTitle>Conexão WhatsApp</CardTitle>
                            <CardDescription>Gerencie a sessão do seu WhatsApp</CardDescription>
                          </div>
                        </div>
                        <StatusBadge status={waStatus} />
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-6">
                      {/* Área de Visualização do Status */}
                      <div className="border rounded-xl p-6 bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center min-h-[280px]">
                        {waStatus === 'LOADING' && (
                          <div className="text-center space-y-3">
                            <Skeleton className="h-20 w-20 rounded-full mx-auto" />
                            <Skeleton className="h-4 w-32 mx-auto" />
                            <Skeleton className="h-3 w-48 mx-auto" />
                          </div>
                        )}
                        
                        {waStatus === 'STARTING' && (
                          <div className="text-center space-y-3">
                            <div className="relative">
                              <div className="absolute inset-0 animate-ping bg-blue-200 rounded-full opacity-75" style={{ animationDuration: '2s' }}></div>
                              <div className="relative bg-blue-100 p-4 rounded-full">
                                <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                              </div>
                            </div>
                            <p className="font-semibold text-blue-800">Iniciando WhatsApp...</p>
                            <p className="text-sm text-muted-foreground">Isso pode levar até 30 segundos</p>
                          </div>
                        )}

                    {waStatus === 'SCANNING' && (
                      <div className="text-center space-y-4">
                        {qrCode ? (
                          <div className="bg-white p-3 rounded-xl shadow-lg border-2 border-green-200 inline-block">
                            <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56" />
                          </div>
                        ) : (
                          <div className="w-56 h-56 flex items-center justify-center border-2 border-dashed border-gray-300 bg-white rounded-xl">
                            <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-gray-800">Escaneie o QR Code</p>
                          <p className="text-sm text-muted-foreground">Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar</p>
                        </div>
                      </div>
                    )}

                    {waStatus === 'CONNECTED' && (
                      <div className="text-center space-y-4">
                        <div className="bg-green-100 p-5 rounded-full inline-block ring-4 ring-green-50">
                          <CheckCircle2 className="h-12 w-12 text-green-600" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-green-700">WhatsApp Conectado!</p>
                          <p className="text-sm text-muted-foreground mt-1">Seu sistema está pronto para enviar mensagens</p>
                        </div>
                        <Badge className="bg-green-600 text-white gap-1">
                          <Zap className="h-3 w-3" /> Sessão Ativa
                        </Badge>
                      </div>
                    )}

                    {waStatus === 'DISCONNECTED' && (
                      <div className="text-center space-y-4">
                        <div className="bg-gray-100 p-5 rounded-full inline-block">
                          <QrCode className="h-12 w-12 text-gray-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-700">Nenhuma sessão ativa</p>
                          <p className="text-sm text-muted-foreground">Clique em "Iniciar Sessão" para conectar seu WhatsApp</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botões de Ação */}
                  <div className="flex flex-wrap gap-3 justify-center">
                    <Button 
                      onClick={handleStartSession} 
                      disabled={isActionLoading || waStatus === 'CONNECTED' || waStatus === 'STARTING' || waStatus === 'SCANNING'}
                      className="bg-green-600 hover:bg-green-700 gap-2"
                      size="lg"
                    >
                      <Power className="h-4 w-4" /> 
                      {waStatus === 'DISCONNECTED' ? 'Iniciar Sessão' : 'Reconectar'}
                    </Button>

                    <Button 
                      variant="outline" 
                      onClick={handleStopSession} 
                      disabled={isActionLoading || waStatus === 'DISCONNECTED' || waStatus === 'LOADING'}
                      className="gap-2"
                      size="lg"
                    >
                      <RefreshCw className="h-4 w-4" /> Reiniciar
                    </Button>

                    <Button 
                      variant="outline"
                      onClick={handleLogout} 
                      disabled={isActionLoading || waStatus === 'DISCONNECTED' || waStatus === 'LOADING'}
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      size="lg"
                    >
                      <LogOut className="h-4 w-4" /> Desconectar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Coluna Lateral - Guia e Dicas */}
            <div className="space-y-6">
              {/* Guia Passo a Passo */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-600" />
                    Como Conectar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <GuideStep 
                    number={1} 
                    title="Iniciar Sessão" 
                    description="Clique no botão verde para começar"
                    active={getCurrentStep() === 1}
                  />
                  <GuideStep 
                    number={2} 
                    title="Aguarde" 
                    description="O sistema está preparando a conexão"
                    active={getCurrentStep() === 2}
                  />
                  <GuideStep 
                    number={3} 
                    title="Escaneie o QR" 
                    description="Use a câmera do seu celular"
                    active={getCurrentStep() === 3}
                  />
                  <GuideStep 
                    number={4} 
                    title="Pronto!" 
                    description="WhatsApp conectado com sucesso"
                    active={getCurrentStep() === 4}
                  />
                </CardContent>
              </Card>

              {/* Dicas de Boas Práticas */}
              <Card className="border-blue-100 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-blue-800">
                    <Lightbulb className="h-4 w-4" />
                    Boas Práticas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-blue-900">
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Use intervalos de <strong>30-60 segundos</strong> entre mensagens</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Limite a <strong>100-200 mensagens/dia</strong> para números novos</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Ban className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Evite mensagens idênticas em massa</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Não envie para números desconhecidos em excesso</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          )}
        </TabsContent>

        {/* ========== TAB INTEGRAÇÕES ========== */}
        <TabsContent value="integrations" className="space-y-6">
          {/* SERP API Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${hasSerpapiKey ? 'bg-green-100' : 'bg-orange-100'}`}>
                    <Globe className={`h-5 w-5 ${hasSerpapiKey ? 'text-green-600' : 'text-orange-600'}`} />
                  </div>
                  <div>
                    <CardTitle>SERP API</CardTitle>
                    <CardDescription>Integração para buscar leads no Google Maps</CardDescription>
                  </div>
                </div>
                <Badge className={hasSerpapiKey ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}>
                  {hasSerpapiKey ? 'Configurado' : 'Pendente'}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="serpapi-key" className="text-sm font-medium">
                  Chave da API
                </label>
                <Input
                  id="serpapi-key"
                  type="password"
                  placeholder="Cole sua chave SERP API aqui"
                  value={serpapiKey}
                  onChange={(e) => setSerpapiKey(e.target.value)}
                  disabled={isSavingSerp}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Obtenha sua chave em:{" "}
                  <a 
                    href="https://serpapi.com/manage-api-key" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    serpapi.com/manage-api-key
                  </a>
                </p>
              </div>
              
              <Button 
                onClick={handleSaveSerpapiKey} 
                disabled={isSavingSerp || !serpapiKey.trim()}
              >
                {isSavingSerp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Chave'
                )}
              </Button>

              {/* Explicação da integração */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Para que serve?</AlertTitle>
                <AlertDescription>
                  A SERP API permite buscar estabelecimentos no Google Maps automaticamente, 
                  extraindo informações de contato como telefone, endereço e site para sua base de leads.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Futuras Integrações */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-muted-foreground">Mais integrações em breve</CardTitle>
              <CardDescription>
                Estamos trabalhando em novas integrações como CRM, Email Marketing e mais.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}