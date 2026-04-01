import { useState } from "react";
import { Rocket, Users, Loader2, Check, MessageSquare, Clock, Calendar, Globe, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lead } from "@/types";
import { useCampaigns } from "@/hooks/useCampaigns";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "@/hooks/use-toast";
import { QuotaLimitModal } from "./QuotaLimitModal";

interface CreateCampaignFromLeadsProps {
  leads: Lead[];
  selectedLeads?: string[];
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
  { value: "America/Sao_Paulo", label: "Brasília", offset: "-03:00" },
  { value: "America/Manaus", label: "Amazonas", offset: "-04:00" },
  { value: "America/Rio_Branco", label: "Acre", offset: "-05:00" },
  { value: "America/Cuiaba", label: "Mato Grosso", offset: "-04:00" },
];

export function CreateCampaignFromLeads({ leads, selectedLeads = [] }: CreateCampaignFromLeadsProps) {
  const [open, setOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const { permissions } = usePlanPermissions();
  const { createCampaignFromLeads } = useCampaigns();
  const { settings } = useCompanySettings();
  
  // Formulário
  const [name, setName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [intervalMin, setIntervalMin] = useState(30);
  const [intervalMax, setIntervalMax] = useState(120);
  const [timezone, setTimezone] = useState(settings?.timezone || "America/Sao_Paulo");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [workingDays, setWorkingDays] = useState<string[]>(["1", "2", "3", "4", "5"]);
  const [dailyLimit, setDailyLimit] = useState(300);

  // Calcular leads a usar
  const leadsToUse = selectedLeads.length > 0 
    ? leads.filter(l => selectedLeads.includes(l.id))
    : leads;
  
  // Filtrar apenas leads com WhatsApp
  const leadsWithWhatsApp = leadsToUse.filter(l => l.hasWhatsApp && l.phone);

  const handleOpenDialog = () => {
    // Verificar se tem permissão para usar disparador
    if (!permissions.canUseDisparador) {
      setShowUpgradeModal(true);
      return;
    }
    
    if (leadsWithWhatsApp.length === 0) {
      toast({
        title: "Sem leads com WhatsApp",
        description: "Selecione leads que tenham WhatsApp validado para criar a campanha.",
        variant: "destructive",
      });
      return;
    }
    
    setOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Erro", description: "Nome da campanha é obrigatório.", variant: "destructive" });
      return;
    }
    if (!messageText.trim()) {
      toast({ title: "Erro", description: "Mensagem é obrigatória.", variant: "destructive" });
      return;
    }
    if (workingDays.length === 0) {
      toast({ title: "Erro", description: "Selecione pelo menos um dia de funcionamento.", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    
    try {
      // Preparar contatos
      const contacts = leadsWithWhatsApp.map(lead => ({
        name: lead.name,
        phone: lead.phone!,
        category: lead.category || "",
        extra_data: {
          address: lead.address,
          website: lead.website,
          rating: lead.rating,
        }
      }));

      // Criar campanha
      await createCampaignFromLeads({
        name: name.trim(),
        message: {
          type: "text",
          text: messageText,
        },
        settings: {
          interval_min: intervalMin,
          interval_max: intervalMax,
          start_time: startTime,
          end_time: endTime,
          daily_limit: dailyLimit,
          working_days: workingDays.map(d => parseInt(d, 10)),
          timezone: timezone,
        },
        contacts: contacts,
      });

      toast({
        title: "Campanha Criada!",
        description: `${contacts.length} contatos adicionados. Acesse o Disparador para iniciar.`,
        className: "bg-green-500 text-white",
      });

      setOpen(false);
      resetForm();
      
    } catch (error: any) {
      console.error("Erro ao criar campanha:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar a campanha.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setName("");
    setMessageText("");
    setWorkingDays(["1", "2", "3", "4", "5"]);
  };

  // Estimativas
  const avgInterval = (intervalMin + intervalMax) / 2;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const hoursPerDay = Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
  const messagesPerHour = Math.floor(3600 / avgInterval);
  const daysToComplete = Math.ceil(leadsWithWhatsApp.length / Math.min(dailyLimit, messagesPerHour * hoursPerDay));

  return (
    <>
      <Button 
        variant="default"
        size="sm" 
        onClick={handleOpenDialog}
        className="gap-2 bg-[#F59600] hover:bg-[#e08900] text-white"
        disabled={leadsToUse.length === 0}
      >
        <Rocket className="h-4 w-4" />
        Criar Campanha
        {selectedLeads.length > 0 && (
          <Badge variant="secondary" className="ml-1 bg-white/20 text-white">
            {leadsWithWhatsApp.length}
          </Badge>
        )}
      </Button>

      <QuotaLimitModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Rocket className="h-5 w-5 text-[#F59600]" />
              Criar Campanha dos Leads
            </DialogTitle>
            <DialogDescription>
              Configure e envie mensagens para os leads selecionados.
            </DialogDescription>
          </DialogHeader>

          {/* Resumo dos Leads */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-blue-900">
                    {leadsWithWhatsApp.length} contatos com WhatsApp
                  </p>
                  <p className="text-sm text-blue-700">
                    {leadsToUse.length - leadsWithWhatsApp.length} leads sem WhatsApp serão ignorados
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha</Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Ex: Leads Janeiro 2025"
              />
            </div>

            {/* Mensagem */}
            <div className="space-y-2">
              <Label htmlFor="message">Mensagem</Label>
              <Textarea 
                id="message" 
                value={messageText} 
                onChange={(e) => setMessageText(e.target.value)} 
                placeholder="Olá {Nome}, tudo bem? Temos uma oferta..." 
                className="h-24"
              />
              <div className="flex gap-2">
                <Badge variant="outline" className="cursor-pointer hover:bg-slate-100" onClick={() => setMessageText(prev => prev + " {Nome}")}>
                  {`{Nome}`}
                </Badge>
              </div>
            </div>

            {/* Configurações Rápidas */}
            <div className="grid grid-cols-2 gap-4">
              {/* Timezone */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Fuso Horário
                </Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label} ({tz.offset})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Limite Diário */}
              <div className="space-y-2">
                <Label>Limite Diário</Label>
                <Select value={String(dailyLimit)} onValueChange={(v) => setDailyLimit(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">100/dia (Seguro)</SelectItem>
                    <SelectItem value="300">300/dia (Recomendado)</SelectItem>
                    <SelectItem value="500">500/dia (Moderado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Horários */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Início
                </Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Término</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            {/* Dias da Semana */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Dias de Envio
              </Label>
              <ToggleGroup type="multiple" value={workingDays} onValueChange={setWorkingDays} className="justify-start gap-1">
                {DAYS_OF_WEEK.map((day) => (
                  <TooltipProvider key={day.value}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem 
                          value={day.value}
                          className="h-9 w-9 rounded-full border data-[state=on]:bg-[#054173] data-[state=on]:text-white"
                        >
                          {day.label}
                        </ToggleGroupItem>
                      </TooltipTrigger>
                      <TooltipContent><p>{day.fullName}</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </ToggleGroup>
            </div>

            {/* Estimativa */}
            <Card className="bg-slate-50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <Info className="h-4 w-4 text-slate-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-slate-700">Estimativa de Conclusão</p>
                    <p className="text-slate-600">
                      ~<strong>{messagesPerHour}</strong> msg/hora • 
                      Tempo estimado: <strong>{daysToComplete} dia{daysToComplete > 1 ? 's' : ''}</strong>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={isCreating || leadsWithWhatsApp.length === 0}
              className="bg-[#F59600] hover:bg-[#e08900] text-white"
            >
              {isCreating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...</>
              ) : (
                <><Check className="mr-2 h-4 w-4" /> Criar Campanha</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
