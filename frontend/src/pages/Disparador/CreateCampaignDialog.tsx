import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Loader2, Calendar, Clock, MessageSquare, Image as ImageIcon, Check, UploadCloud, FileSpreadsheet, Globe, Info, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const DAYS_OF_WEEK = [
  { value: "0", label: "D", fullName: "Domingo" },
  { value: "1", label: "S", fullName: "Segunda" },
  { value: "2", label: "T", fullName: "Terça" },
  { value: "3", label: "Q", fullName: "Quarta" },
  { value: "4", label: "Q", fullName: "Quinta" },
  { value: "5", label: "S", fullName: "Sexta" },
  { value: "6", label: "S", fullName: "Sábado" },
];

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (SP/RJ/MG)", offset: "-03:00" },
  { value: "America/Manaus", label: "Amazonas (Manaus)", offset: "-04:00" },
  { value: "America/Rio_Branco", label: "Acre (Rio Branco)", offset: "-05:00" },
  { value: "America/Cuiaba", label: "Mato Grosso (Cuiabá)", offset: "-04:00" },
  { value: "America/Noronha", label: "Fernando de Noronha", offset: "-02:00" },
  { value: "America/Fortaleza", label: "Nordeste (Fortaleza)", offset: "-03:00" },
];

const PRESET_SCHEDULES = [
  { label: "Horário Comercial", start: "08:00", end: "18:00", days: ["1", "2", "3", "4", "5"] },
  { label: "Manhã", start: "08:00", end: "12:00", days: ["1", "2", "3", "4", "5"] },
  { label: "Tarde", start: "13:00", end: "18:00", days: ["1", "2", "3", "4", "5"] },
  { label: "Dia Inteiro", start: "08:00", end: "21:00", days: ["1", "2", "3", "4", "5"] },
];

export function CreateCampaignDialog({ open, onOpenChange, onSuccess }: CreateCampaignDialogProps) {
  const { createCampaign, uploadContacts, isCreating } = useCampaigns();
  const { settings } = useCompanySettings();
  
  // Estado do Formulário
  const [name, setName] = useState("");
  const [messageType, setMessageType] = useState<"text" | "image" | "document">("text");
  const [messageText, setMessageText] = useState("");
  
  // Arquivos
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [contactsFile, setContactsFile] = useState<File | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  
  // Configurações de Intervalo
  const [intervalMin, setIntervalMin] = useState(30);
  const [intervalMax, setIntervalMax] = useState(120);
  
  // Configurações de Horário
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [workingDays, setWorkingDays] = useState<string[]>(["1", "2", "3", "4", "5"]);
  const [dailyLimit, setDailyLimit] = useState(500);

  // Carregar timezone das configurações da empresa
  useEffect(() => {
    if (settings?.timezone) {
      setTimezone(settings.timezone);
    }
  }, [settings]);

  const applyPreset = (preset: typeof PRESET_SCHEDULES[0]) => {
    setStartTime(preset.start);
    setEndTime(preset.end);
    setWorkingDays(preset.days);
    toast({
      title: `Preset aplicado: ${preset.label}`,
      description: `${preset.start} - ${preset.end}`,
    });
  };

  const toggleDay = (dayValue: string) => {
    setWorkingDays(prev => 
      prev.includes(dayValue)
        ? prev.filter(d => d !== dayValue)
        : [...prev, dayValue]
    );
  };

  const uploadMedia = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('campaigns')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('campaigns')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast({ 
        title: "Erro no Upload", 
        description: "Falha ao enviar imagem. Verifique se o bucket 'campaigns' existe e é público.", 
        variant: "destructive" 
      });
      return null;
    }
  };

  const handleSubmit = async () => {
    // 1. Validações Básicas
    if (!name.trim()) {
      toast({ title: "Erro", description: "O nome da campanha é obrigatório.", variant: "destructive" });
      return;
    }
    if (messageType === 'text' && !messageText.trim()) {
      toast({ title: "Erro", description: "O texto da mensagem é obrigatório.", variant: "destructive" });
      return;
    }
    if ((messageType === 'image' || messageType === 'document') && !mediaFile) {
      toast({ title: "Erro", description: "Selecione uma imagem/arquivo para enviar.", variant: "destructive" });
      return;
    }
    if (!contactsFile) {
      toast({ title: "Erro", description: "A planilha de contatos é obrigatória.", variant: "destructive" });
      return;
    }
    if (workingDays.length === 0) {
      toast({ title: "Erro", description: "Selecione pelo menos um dia de funcionamento.", variant: "destructive" });
      return;
    }

    // Validar horários
    if (startTime >= endTime) {
      toast({ title: "Erro", description: "O horário de início deve ser anterior ao de término.", variant: "destructive" });
      return;
    }

    try {
      setIsUploading(true);
      let finalMediaUrl: string | undefined = undefined;

      // 2. Upload da Mídia (se houver)
      if (mediaFile && (messageType === 'image' || messageType === 'document')) {
        const url = await uploadMedia(mediaFile);
        if (!url) {
          setIsUploading(false);
          return;
        }
        finalMediaUrl = url;
      }

      // 3. Montar Payload
      const campaignData = {
        name: name.trim(),
        message: {
          type: messageType,
          text: messageText || "",
          media_url: finalMediaUrl || undefined,
          media_filename: mediaFile ? mediaFile.name : (messageType === 'document' ? 'documento' : undefined)
        },
        settings: {
          interval_min: Math.floor(Number(intervalMin)),
          interval_max: Math.floor(Number(intervalMax)),
          start_time: startTime || "08:00",
          end_time: endTime || "18:00",
          daily_limit: Math.floor(Number(dailyLimit)) || 500,
          working_days: workingDays.map(d => parseInt(d, 10)),
          timezone: timezone
        }
      };

      console.log("Payload Enviado:", JSON.stringify(campaignData, null, 2));

      // 4. Enviar
      const newCampaign = await createCampaign(
        campaignData.name,
        campaignData.message,
        campaignData.settings
      );
      
      // 5. Upload dos Contatos
      if (newCampaign && newCampaign.id) {
        toast({ title: "Enviando contatos...", description: "Processando sua planilha." });
        await uploadContacts(newCampaign.id, contactsFile);
        
        toast({ 
          title: "Sucesso!", 
          description: "Campanha criada e contatos importados.", 
          className: "bg-green-500 text-white" 
        });
        
        if (onSuccess) onSuccess();
        onOpenChange(false);
        resetForm();
      } else {
        toast({ title: "Campanha criada", description: "Atualize a página para ver." });
        if (onSuccess) onSuccess();
        onOpenChange(false);
      }
      
    } catch (error: any) {
      console.error("Erro completo:", error);
      
      let errorMessage = "Erro ao processar requisição.";
      if (error?.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail
            .map((err: any) => `${err.loc.join('.')} -> ${err.msg}`)
            .join(' | ');
        } else {
          errorMessage = error.response.data.detail;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({ 
        title: "Erro ao criar", 
        description: `Falha: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`, 
        variant: "destructive" 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setMessageText("");
    setMediaFile(null);
    setContactsFile(null);
    setWorkingDays(["1", "2", "3", "4", "5"]);
    setStartTime("08:00");
    setEndTime("18:00");
    setIntervalMin(30);
    setIntervalMax(120);
  };

  // Calcular tempo estimado de disparo
  const avgInterval = (intervalMin + intervalMax) / 2;
  const hoursPerDay = (() => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
  })();
  const messagesPerHour = Math.floor(3600 / avgInterval);
  const estimatedDailyCapacity = Math.min(dailyLimit, messagesPerHour * hoursPerDay);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-800">Nova Campanha</DialogTitle>
          <DialogDescription>
            Configure sua campanha de disparo de mensagens.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Campanha</Label>
            <Input 
              id="name" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="Ex: Leads Janeiro 2025" 
              className="font-medium"
            />
          </div>

          {/* ÁREA DE IMPORTAÇÃO DE CONTATOS */}
          <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              <Label className="text-base font-semibold text-slate-700">Planilha de Contatos</Label>
            </div>
            <Input 
              type="file" 
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setContactsFile(e.target.files?.[0] || null)}
              className="bg-white"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Formatos aceitos: .xlsx, .xls, .csv (Colunas obrigatórias: Nome, Telefone)
            </p>
          </div>

          <Tabs defaultValue="message" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="message" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Mensagem
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Agendamento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="message" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Tipo de Mensagem</Label>
                <div className="flex gap-2">
                  <Button 
                    type="button"
                    variant={messageType === 'text' ? 'default' : 'outline'}
                    className={`flex-1 ${messageType === 'text' ? 'bg-[#F59600] hover:bg-[#d68200] text-white' : ''}`}
                    onClick={() => setMessageType('text')}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" /> Texto
                  </Button>
                  <Button 
                    type="button"
                    variant={messageType === 'image' ? 'default' : 'outline'}
                    className={`flex-1 ${messageType === 'image' ? 'bg-[#F59600] hover:bg-[#d68200] text-white' : ''}`}
                    onClick={() => setMessageType('image')}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" /> Imagem
                  </Button>
                </div>
              </div>

              {/* Upload de Imagem */}
              {messageType !== 'text' && (
                <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                  <Label htmlFor="mediaFile">Upload da Imagem</Label>
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 transition-colors relative">
                    <Input 
                      id="mediaFile" 
                      type="file" 
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => setMediaFile(e.target.files?.[0] || null)} 
                    />
                    {mediaFile ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <Check className="h-5 w-5" />
                        <span className="font-medium text-sm">{mediaFile.name}</span>
                      </div>
                    ) : (
                      <>
                        <UploadCloud className="h-8 w-8 text-slate-400 mb-2" />
                        <span className="text-sm text-slate-600 font-medium">Clique para selecionar uma imagem</span>
                        <span className="text-xs text-slate-400 mt-1">JPG, PNG (Máx 5MB)</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="message">
                  {messageType === 'text' ? 'Conteúdo da Mensagem' : 'Legenda da Imagem'}
                </Label>
                <Textarea 
                  id="message" 
                  value={messageText} 
                  onChange={(e) => setMessageText(e.target.value)} 
                  placeholder="Olá {Nome}, tudo bem? Temos uma oferta..." 
                  className="h-32 resize-none"
                />
                <div className="flex gap-2">
                  <Badge variant="outline" className="cursor-pointer hover:bg-slate-100" onClick={() => setMessageText(prev => prev + " {Nome}")}>
                    {`{Nome}`}
                  </Badge>
                  <Badge variant="outline" className="cursor-pointer hover:bg-slate-100" onClick={() => setMessageText(prev => prev + " {Empresa}")}>
                    {`{Empresa}`}
                  </Badge>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-5 pt-4">
              
              {/* Fuso Horário */}
              <Card className="border-blue-100 bg-blue-50/30">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-600" />
                    <Label className="font-semibold text-blue-900">Fuso Horário</Label>
                  </div>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          <div className="flex items-center gap-2">
                            <span>{tz.label}</span>
                            <span className="text-xs text-muted-foreground">({tz.offset})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-blue-700">
                    Os horários de disparo seguirão este fuso horário.
                  </p>
                </CardContent>
              </Card>

              {/* Presets de Horário */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Horário de Disparo
                </Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_SCHEDULES.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(preset)}
                      className="text-xs"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Horário Início/Fim */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Início</Label>
                  <Input 
                    type="time" 
                    value={startTime} 
                    onChange={(e) => setStartTime(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Término</Label>
                  <Input 
                    type="time" 
                    value={endTime} 
                    onChange={(e) => setEndTime(e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>

              {/* Preview Visual do Horário */}
              <div className="bg-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-600">Janela de disparo:</span>
                  <span className="font-semibold text-slate-800">{startTime} - {endTime}</span>
                </div>
                <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
                  {(() => {
                    const [sh] = startTime.split(':').map(Number);
                    const [eh] = endTime.split(':').map(Number);
                    const startPercent = (sh / 24) * 100;
                    const endPercent = (eh / 24) * 100;
                    return (
                      <div 
                        className="absolute h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                        style={{ 
                          left: `${startPercent}%`, 
                          width: `${endPercent - startPercent}%` 
                        }}
                      />
                    );
                  })()}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>24:00</span>
                </div>
              </div>

              {/* Dias da Semana */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Dias de Funcionamento
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_OF_WEEK.map((day) => {
                    const isSelected = workingDays.includes(day.value);
                    return (
                      <TooltipProvider key={day.value}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => toggleDay(day.value)}
                              className={`
                                h-10 w-10 rounded-full border-2 font-semibold transition-all duration-200
                                ${isSelected 
                                  ? 'bg-[#054173] text-white border-[#054173] shadow-md' 
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }
                              `}
                              aria-label={day.fullName}
                              aria-pressed={isSelected}
                            >
                              {day.label}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{day.fullName}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecionados: {workingDays.length > 0 
                    ? workingDays.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.fullName).join(', ')
                    : 'Nenhum'
                  }
                </p>
              </div>

              {/* Intervalo entre mensagens */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    Intervalo entre mensagens
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Tempo aleatório entre cada envio. Intervalos maiores são mais seguros.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Badge variant="outline" className="font-mono">
                    {intervalMin}s - {intervalMax}s
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Mínimo (seg)</Label>
                    <Input 
                      type="number" 
                      value={intervalMin} 
                      onChange={(e) => setIntervalMin(Math.max(10, Number(e.target.value)))}
                      min={10}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Máximo (seg)</Label>
                    <Input 
                      type="number" 
                      value={intervalMax} 
                      onChange={(e) => setIntervalMax(Math.max(intervalMin + 5, Number(e.target.value)))}
                      min={intervalMin + 5}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Limite Diário */}
              <div className="space-y-3">
                <Label>Limite Diário de Envios</Label>
                <Select value={String(dailyLimit)} onValueChange={(v) => setDailyLimit(Number(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">
                      <div className="flex items-center gap-2">
                        <span>100 mensagens</span>
                        <Badge className="bg-green-100 text-green-700 text-[10px]">Seguro</Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="300">
                      <div className="flex items-center gap-2">
                        <span>300 mensagens</span>
                        <Badge className="bg-green-100 text-green-700 text-[10px]">Recomendado</Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="500">
                      <div className="flex items-center gap-2">
                        <span>500 mensagens</span>
                        <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">Moderado</Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="1000">
                      <div className="flex items-center gap-2">
                        <span>1000 mensagens</span>
                        <Badge className="bg-orange-100 text-orange-700 text-[10px]">Alto Volume</Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="2000">
                      <div className="flex items-center gap-2">
                        <span>2000 mensagens</span>
                        <Badge className="bg-red-100 text-red-700 text-[10px]">Alto Risco</Badge>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Resumo/Estimativa */}
              <Card className="bg-slate-50 border-slate-200">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-200 rounded-lg">
                      <Info className="h-4 w-4 text-slate-600" />
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-slate-700">Estimativa de Capacidade</p>
                      <p className="text-slate-600">
                        ~<strong>{messagesPerHour}</strong> msg/hora • 
                        ~<strong>{Math.round(estimatedDailyCapacity)}</strong> msg/dia
                      </p>
                      <p className="text-xs text-slate-500">
                        Operando {hoursPerDay.toFixed(1)}h/dia em {workingDays.length} dias/semana
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isCreating || isUploading}
            className="bg-[#F59600] hover:bg-[#e08900] text-white font-semibold"
          >
            {isCreating || isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                {isUploading ? "Enviando..." : "Criando..."}
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" /> Criar Campanha
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
