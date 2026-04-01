import { useState, useEffect } from "react";
import { CreateCampaignDialog } from "./CreateCampaignDialog";
import { CampaignCard } from "./CampaignCard";
import { MessageLogsDialog } from "./MessageLogsDialog";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { PlanBlockedOverlay } from "@/components/PlanBlockedOverlay";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageSquare,
  Send,
  Users,
  CheckCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  Plus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Disparador() {
  const { setPageTitle } = usePageTitle();
  
  useEffect(() => {
    setPageTitle("Disparador", Send);
  }, [setPageTitle]);

  const { campaigns, isLoading, error, fetchCampaigns } = useCampaigns();
  const { settings, hasWahaConfig, isLoading: isLoadingSettings, refreshSettings } = useCompanySettings();
  const { permissions, isLoading: isLoadingPermissions } = usePlanPermissions();
  
  // Estado para controlar a visibilidade do modal de criação
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [autoRefresh] = useState(true);

  const wahaConfig = hasWahaConfig && settings ? {
    url: settings.wahaApiUrl!,
    apiKey: settings.wahaApiKey!,
    session: settings.wahaSession || "default"
  } : undefined;

  useEffect(() => {
    refreshSettings();
  }, []);

  useEffect(() => {
    if (!permissions.canUseDisparador) return;

    // Otimização Arquitetural: Utiliza Supabase Realtime invés de Pooling manual (Sem Excessos de Rede)
    const channel = supabase
      .channel('public:campaigns')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaigns' },
        (payload) => {
          // Quando qualquer campanha atualizar no banco o status ou envios, a tela reflete via push
          fetchCampaigns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCampaigns, permissions.canUseDisparador]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  const stats = {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter((c) => c.status === "running").length,
    totalSent: campaigns.reduce((sum, c) => sum + c.sent_count, 0),
    totalContacts: campaigns.reduce((sum, c) => sum + c.total_contacts, 0),
  };

  // Loading
  if (isLoadingSettings || isLoadingPermissions) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Verificar se conta está suspensa
  if (permissions.isSuspended) {
    return (
      <PlanBlockedOverlay
        feature="disparador"
        currentPlan={permissions.planName}
        requiredPlan="intermediario"
        isSuspended={true}
      />
    );
  }

  // Verificar se plano expirou
  if (permissions.isPlanExpired) {
    return (
      <PlanBlockedOverlay
        feature="disparador"
        currentPlan={permissions.planName}
        requiredPlan="intermediario"
        isExpired={true}
        expiresAt={permissions.expiresAt}
      />
    );
  }

  // Verificar se tem permissão para usar disparador
  if (!permissions.canUseDisparador) {
    return (
      <PlanBlockedOverlay
        feature="disparador"
        currentPlan={permissions.planName}
        requiredPlan="intermediario"
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-800">Disparador</h2>
          <p className="text-muted-foreground mt-1">
            Envie mensagens em massa para seus leads via WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchCampaigns()}
            disabled={isLoading}
            className="bg-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          
          {/* BOTÃO QUE TINHA SUMIDO */}
          <Button 
            onClick={() => setIsCreateOpen(true)} 
            className="bg-[#F59600] hover:bg-[#e08900] text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Nova Campanha
          </Button>

          {/* Dialog Controlado */}
          <CreateCampaignDialog 
            open={isCreateOpen} 
            onOpenChange={setIsCreateOpen}
            onSuccess={() => fetchCampaigns()}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-white shadow-sm border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Campanhas</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-800">{stats.totalCampaigns}</div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Campanhas Ativas</CardTitle>
            <Loader2 className={`h-4 w-4 ${stats.activeCampaigns > 0 ? "animate-spin text-green-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.activeCampaigns}</div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mensagens Enviadas</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-800">{stats.totalSent}</div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Contatos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-800">{stats.totalContacts}</div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="bg-white shadow-sm border-none">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Erro ao carregar campanhas</h3>
            <p className="text-muted-foreground mb-4 max-w-md">{error}</p>
            <Button onClick={() => fetchCampaigns()} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="bg-white shadow-sm border-none">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-gray-800">Nenhuma campanha ainda</h3>
            <p className="text-muted-foreground mb-4">
              Crie sua primeira campanha para começar a enviar mensagens.
            </p>
            {/* Botão de criar para o estado vazio */}
            <Button onClick={() => setIsCreateOpen(true)} className="bg-[#F59600] hover:bg-[#e08900] text-white">
              <Plus className="h-4 w-4 mr-2" />
              Criar Campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onViewLogs={(id) => setSelectedCampaignId(id)}
              wahaConfig={wahaConfig}
              onRefresh={() => fetchCampaigns()}
            />
          ))}
        </div>
      )}

      <MessageLogsDialog
        campaignId={selectedCampaignId}
        campaignName={selectedCampaign?.name}
        onClose={() => setSelectedCampaignId(null)}
      />
    </div>
  );
}