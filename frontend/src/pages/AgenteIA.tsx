import { useState, useEffect } from "react";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { PlanBlockedOverlay } from "@/components/PlanBlockedOverlay";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { 
  Bot, 
  Settings2, 
  MessageSquare, 
  Brain, 
  Sparkles,
  Save,
  Loader2,
  Info,
  Clock,
  Target,
  Shield,
  Lightbulb,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AgenteIA() {
  const { setPageTitle } = usePageTitle();
  const { permissions, isLoading: isLoadingPermissions } = usePlanPermissions();
  const { settings, saveSettings, isSaving: isSavingGlobal } = useCompanySettings();
  const { toast } = useToast();
  
  // Campos locais do formulário
  const [enabled, setEnabled] = useState(false);
  const [name, setName] = useState("Assistente Virtual");
  const [tone, setTone] = useState<'formal' | 'casual' | 'professional' | 'friendly'>('professional');
  const [personality, setPersonality] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [responseDelay, setResponseDelay] = useState(3);
  const [maxResponseLength, setMaxResponseLength] = useState(500);
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState(false);
  const [workingHoursStart, setWorkingHoursStart] = useState("09:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("18:00");
  const [autoQualify, setAutoQualify] = useState(true);
  const [qualificationQuestions, setQualificationQuestions] = useState<string[]>([]);
  const [blockedTopics, setBlockedTopics] = useState<string[]>([]);
  
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setPageTitle("Agente IA", Bot);
  }, [setPageTitle]);

  // Carregar configurações do Supabase
  useEffect(() => {
    if (settings && !isInitialized) {
      setEnabled(settings.agentEnabled);
      setName(settings.agentName);
      setTone(settings.agentTone);
      setPersonality(settings.agentPersonality);
      setSystemPrompt(settings.agentSystemPrompt);
      setWelcomeMessage(settings.agentWelcomeMessage);
      setResponseDelay(settings.agentResponseDelay);
      setMaxResponseLength(settings.agentMaxResponseLength);
      setWorkingHoursEnabled(settings.agentWorkingHoursEnabled);
      setWorkingHoursStart(settings.agentWorkingHoursStart);
      setWorkingHoursEnd(settings.agentWorkingHoursEnd);
      setAutoQualify(settings.agentAutoQualify);
      setQualificationQuestions(settings.agentQualificationQuestions);
      setBlockedTopics(settings.agentBlockedTopics);
      setIsInitialized(true);
    }
  }, [settings, isInitialized]);

  const markChanged = () => setHasChanges(true);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await saveSettings({
        agentEnabled: enabled,
        agentName: name,
        agentTone: tone,
        agentPersonality: personality,
        agentSystemPrompt: systemPrompt,
        agentWelcomeMessage: welcomeMessage,
        agentResponseDelay: responseDelay,
        agentMaxResponseLength: maxResponseLength,
        agentWorkingHoursEnabled: workingHoursEnabled,
        agentWorkingHoursStart: workingHoursStart,
        agentWorkingHoursEnd: workingHoursEnd,
        agentAutoQualify: autoQualify,
        agentQualificationQuestions: qualificationQuestions,
        agentBlockedTopics: blockedTopics,
      });
      
      if (success) {
        toast({
          title: "Configurações salvas!",
          description: "As configurações do agente foram atualizadas no banco de dados.",
        });
        setHasChanges(false);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Loading
  if (isLoadingPermissions) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // Verificar se conta está suspensa
  if (permissions.isSuspended) {
    return (
      <PlanBlockedOverlay
        feature="agente"
        currentPlan={permissions.planName}
        requiredPlan="avancado"
        isSuspended={true}
      />
    );
  }

  // Verificar se plano expirou
  if (permissions.isPlanExpired) {
    return (
      <PlanBlockedOverlay
        feature="agente"
        currentPlan={permissions.planName}
        requiredPlan="avancado"
        isExpired={true}
        expiresAt={permissions.expiresAt}
      />
    );
  }

  // Verificar se tem permissão
  if (!permissions.canUseAgenteIA) {
    return (
      <PlanBlockedOverlay
        feature="agente"
        currentPlan={permissions.planName}
        requiredPlan="avancado"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Agente IA</h2>
            <Badge className="bg-purple-600 text-white">Beta</Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Configure seu assistente virtual inteligente para WhatsApp
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {hasChanges && (
            <Badge variant="outline" className="text-orange-600 border-orange-200">
              Alterações não salvas
            </Badge>
          )}
          <Button 
            onClick={handleSave} 
            disabled={isSaving || isSavingGlobal || !hasChanges}
            className="gap-2 bg-purple-600 hover:bg-purple-700"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <Card className={`border-2 ${enabled ? 'border-green-200 bg-green-50/50' : 'border-slate-200'}`}>
        <CardContent className="flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full ${enabled ? 'bg-green-100' : 'bg-slate-100'}`}>
              <Bot className={`h-6 w-6 ${enabled ? 'text-green-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                Agente {enabled ? 'Ativo' : 'Desativado'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {enabled 
                  ? 'O agente está configurado para responder mensagens automaticamente' 
                  : 'Ative para começar a responder automaticamente'}
              </p>
            </div>
          </div>
          
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => { setEnabled(checked); markChanged(); }}
            className="scale-125"
          />
        </CardContent>
      </Card>

      {/* Aviso de Integração */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Integração com n8n Pendente</p>
            <p className="text-sm text-amber-700 mt-1">
              As configurações são salvas no banco de dados. A integração completa com o workflow n8n 
              para leitura automática desses parâmetros será feita em breve. Por enquanto, configure os parâmetros do seu agente.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs de Configuração */}
      <Tabs defaultValue="personality" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="personality" className="gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Personalidade</span>
          </TabsTrigger>
          <TabsTrigger value="prompts" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Prompts</span>
          </TabsTrigger>
          <TabsTrigger value="behavior" className="gap-2">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Comportamento</span>
          </TabsTrigger>
          <TabsTrigger value="qualification" className="gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Qualificação</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab: Personalidade */}
        <TabsContent value="personality" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Identidade do Agente
              </CardTitle>
              <CardDescription>
                Defina como seu agente se apresenta e interage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Nome do Agente</Label>
                  <Input
                    id="agent-name"
                    value={name}
                    onChange={(e) => { setName(e.target.value); markChanged(); }}
                    placeholder="Ex: Sofia, Assistente Virtual"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="agent-tone">Tom de Comunicação</Label>
                  <Select 
                    value={tone} 
                    onValueChange={(value: typeof tone) => { setTone(value); markChanged(); }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="professional">Profissional</SelectItem>
                      <SelectItem value="friendly">Amigável</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-personality">Descrição da Personalidade</Label>
                <Textarea
                  id="agent-personality"
                  value={personality}
                  onChange={(e) => { setPersonality(e.target.value); markChanged(); }}
                  placeholder="Descreva como o agente deve se comportar..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Uma breve descrição de como o agente deve se apresentar e agir
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-welcome">Mensagem de Boas-vindas</Label>
                <Textarea
                  id="agent-welcome"
                  value={welcomeMessage}
                  onChange={(e) => { setWelcomeMessage(e.target.value); markChanged(); }}
                  placeholder="Primeira mensagem enviada ao contato..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Prompts */}
        <TabsContent value="prompts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                Prompt do Sistema
              </CardTitle>
              <CardDescription>
                Instruções detalhadas de como o agente deve se comportar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="agent-systemPrompt">Instruções do Agente</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p>Este prompt é enviado ao modelo de IA antes de cada conversa. 
                        Define o contexto, regras e comportamento do agente.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  id="agent-systemPrompt"
                  value={systemPrompt}
                  onChange={(e) => { setSystemPrompt(e.target.value); markChanged(); }}
                  placeholder="Defina as instruções detalhadas..."
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-slate-700">Dicas para um bom prompt:</p>
                    <ul className="mt-2 space-y-1 text-slate-600">
                      <li>• Defina claramente o papel do agente</li>
                      <li>• Liste as principais responsabilidades</li>
                      <li>• Estabeleça regras e limitações</li>
                      <li>• Indique quando transferir para humano</li>
                      <li>• Especifique informações a coletar</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Comportamento */}
        <TabsContent value="behavior" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-purple-600" />
                Configurações de Resposta
              </CardTitle>
              <CardDescription>
                Ajuste o tempo e formato das respostas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Delay de Resposta: {responseDelay}s</Label>
                    <span className="text-sm text-muted-foreground">
                      Simula tempo de digitação
                    </span>
                  </div>
                  <Slider
                    value={[responseDelay]}
                    onValueChange={([value]) => { setResponseDelay(value); markChanged(); }}
                    min={1}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Aguarda alguns segundos antes de responder para parecer mais natural
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Tamanho Máximo: {maxResponseLength} caracteres</Label>
                  </div>
                  <Slider
                    value={[maxResponseLength]}
                    onValueChange={([value]) => { setMaxResponseLength(value); markChanged(); }}
                    min={100}
                    max={1000}
                    step={50}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Horário de Funcionamento
                </h4>
                
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-medium">Limitar horário</p>
                    <p className="text-sm text-muted-foreground">
                      Agente só responde em horário comercial
                    </p>
                  </div>
                  <Switch
                    checked={workingHoursEnabled}
                    onCheckedChange={(checked) => { setWorkingHoursEnabled(checked); markChanged(); }}
                  />
                </div>

                {workingHoursEnabled && (
                  <div className="grid gap-4 sm:grid-cols-2 p-4 bg-slate-50 rounded-lg">
                    <div className="space-y-2">
                      <Label>Início</Label>
                      <Input
                        type="time"
                        value={workingHoursStart}
                        onChange={(e) => { setWorkingHoursStart(e.target.value); markChanged(); }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim</Label>
                      <Input
                        type="time"
                        value={workingHoursEnd}
                        onChange={(e) => { setWorkingHoursEnd(e.target.value); markChanged(); }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Qualificação */}
        <TabsContent value="qualification" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-600" />
                Qualificação Automática
              </CardTitle>
              <CardDescription>
                Configure como o agente qualifica leads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Qualificação Automática</p>
                  <p className="text-sm text-muted-foreground">
                    Agente coleta informações do lead durante a conversa
                  </p>
                </div>
                <Switch
                  checked={autoQualify}
                  onCheckedChange={(checked) => { setAutoQualify(checked); markChanged(); }}
                />
              </div>

              {autoQualify && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
                  <Label>Perguntas de Qualificação</Label>
                  <Textarea
                    value={qualificationQuestions.join('\n')}
                    onChange={(e) => { 
                      setQualificationQuestions(e.target.value.split('\n').filter(q => q.trim())); 
                      markChanged(); 
                    }}
                    placeholder="Uma pergunta por linha..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    O agente tentará coletar essas informações naturalmente durante a conversa
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-600" />
                Tópicos Bloqueados
              </CardTitle>
              <CardDescription>
                Assuntos que o agente não deve discutir
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={blockedTopics.join('\n')}
                onChange={(e) => { 
                  setBlockedTopics(e.target.value.split('\n').filter(t => t.trim())); 
                  markChanged(); 
                }}
                placeholder="Um tópico por linha (ex: preços, concorrentes, política)..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-2">
                O agente direcionará para atendimento humano quando esses tópicos surgirem
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
