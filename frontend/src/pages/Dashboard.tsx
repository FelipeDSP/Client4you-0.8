import { useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Send,
  Activity,
  Search,
  MessageSquare,
  AlertCircle,
  Clock,
  LayoutDashboard,
  Loader2,
  Wifi,
  WifiOff
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QuotaBar } from "@/components/QuotaBar";
import { PlanExpirationAlert } from "@/components/PlanExpirationAlert";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useWahaStatus } from "@/hooks/useWahaStatus";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Dashboard() {
  const { setPageTitle } = usePageTitle();
  
  // Set page title
  useEffect(() => {
    setPageTitle("Dashboard", LayoutDashboard);
  }, [setPageTitle]);

  // 1. Buscamos dados via backend stats (leve - apenas contagens, sem baixar todos os leads)
  const { stats: dashboardStats, isLoading: isLoadingStats } = useDashboardStats();
  const { campaigns, isLoading: isLoadingCampaigns } = useCampaigns();
  const { hasWahaConfig } = useCompanySettings();
  const { status: waStatus, isLoading: isLoadingWaha, isConnected } = useWahaStatus();

  // 2. KPIs vêm diretamente do backend (sem baixar dados completos)
  const stats = useMemo(() => ({
    totalLeads: dashboardStats.total_leads,
    activeCampaigns: dashboardStats.active_campaigns,
    completedCampaigns: campaigns?.filter(c => c.status === 'completed').length || 0,
    totalMessagesSent: dashboardStats.total_messages_sent,
  }), [dashboardStats, campaigns]);

  // 3. Criamos uma "Timeline" com campanhas recentes (sem baixar todos os leads/buscas)
  const recentActivity = useMemo(() => {
    const activities: Array<{
      id: string;
      type: string;
      title: string;
      subtitle: string;
      date: Date;
      icon: typeof MessageSquare;
      color: string;
    }> = [];

    // Adiciona campanhas ao histórico
    if (campaigns) {
      campaigns.forEach(campaign => {
        activities.push({
          id: `camp-${campaign.id}`,
          type: 'campaign',
          title: `Campanha: ${campaign.name}`,
          subtitle: `${campaign.total_contacts} contatos • Status: ${campaign.status}`,
          date: new Date(campaign.created_at || new Date()),
          icon: MessageSquare,
          color: "text-green-500 bg-green-50"
        });
      });
    }

    // Ordena do mais recente para o mais antigo e pega os top 5
    return activities.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  }, [campaigns]);

  // Campanhas rodando agora (para destaque)
  const runningCampaigns = campaigns?.filter(c => c.status === 'running') || [];

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Alerta de Expiração de Plano */}
      <PlanExpirationAlert />
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-800">Visão Geral</h2>
          <p className="text-muted-foreground mt-1">
            Métricas em tempo real da sua operação.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/search">
            <Button className="gap-2 shadow-sm">
              <Search className="h-4 w-4" />
              Buscar Leads
            </Button>
          </Link>
          <Link to="/disparador">
            <Button variant="outline" className="gap-2 shadow-sm bg-white">
              <Send className="h-4 w-4" />
              Criar Campanha
            </Button>
          </Link>
        </div>
      </div>

      {/* Quota Bar */}
      <QuotaBar />

      {/* Cards de KPI Globais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white shadow-sm border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Leads</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-24" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-800">{stats.totalLeads}</div>
                <p className="text-xs text-muted-foreground mt-1">Contatos na base</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Campanhas Ativas</CardTitle>
            <Activity className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {isLoadingCampaigns ? (
              <>
                <Skeleton className="h-8 w-12 mb-1" />
                <Skeleton className="h-3 w-28" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-800">{stats.activeCampaigns}</div>
                <p className="text-xs text-muted-foreground mt-1">Disparando agora</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mensagens Enviadas</CardTitle>
            <Send className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            {isLoadingCampaigns ? (
              <>
                <Skeleton className="h-8 w-20 mb-1" />
                <Skeleton className="h-3 w-24" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-800">{stats.totalMessagesSent}</div>
                <p className="text-xs text-muted-foreground mt-1">Total acumulado</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status WhatsApp</CardTitle>
            {isLoadingWaha ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : isConnected ? (
              <Wifi className="h-4 w-4 text-emerald-600" />
            ) : waStatus === "NOT_CONFIGURED" ? (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            ) : waStatus === "SCANNING" ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium text-gray-800">
              {isLoadingWaha ? "Verificando..." : 
               isConnected ? "Conectado" : 
               waStatus === "NOT_CONFIGURED" ? "Configurar" :
               waStatus === "SCANNING" ? "Escaneando QR" :
               waStatus === "STARTING" ? "Iniciando..." :
               "Desconectado"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isConnected ? "Pronto para enviar" : 
               waStatus === "NOT_CONFIGURED" ? "Configure nas Configurações" :
               "Verifique nas Configurações"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        
        {/* Coluna Principal (Esq) - Status de Campanhas */}
        <Card className="md:col-span-4 bg-white shadow-sm border-none flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg text-gray-800">Campanhas em Execução</CardTitle>
            <CardDescription>Acompanhe o progresso dos disparos atuais.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {isLoadingCampaigns ? (
              <div className="space-y-6">
                {[1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : runningCampaigns.length > 0 ? (
              <div className="space-y-6">
                {runningCampaigns.map(campaign => (
                  <div key={campaign.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{campaign.name}</span>
                      <span className="text-muted-foreground">
                        {campaign.sent_count} / {campaign.total_contacts}
                      </span>
                    </div>
                    <Progress 
                      value={campaign.total_contacts > 0 ? (campaign.sent_count / campaign.total_contacts) * 100 : 0} 
                      className="h-2" 
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-100 rounded-lg min-h-[200px]">
                <div className="bg-gray-50 p-3 rounded-full mb-3">
                  <Activity className="h-6 w-6 text-gray-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-900">Nenhuma campanha ativa</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-xs">
                  Todas as suas campanhas foram concluídas ou estão pausadas.
                </p>
                <Link to="/disparador">
                  <Button variant="outline" size="sm">Iniciar Nova Campanha</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coluna Secundária (Dir) - Feed de Atividade */}
        <Card className="md:col-span-3 bg-white shadow-sm border-none flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg text-gray-800">Atividade Recente</CardTitle>
            <CardDescription>Últimas ações realizadas no sistema.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-6">
              {isLoadingStats && isLoadingCampaigns ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-2 w-20" />
                    </div>
                  </div>
                ))
              ) : recentActivity.length > 0 ? (
                recentActivity.map((activity, index) => (
                  <div key={activity.id} className="flex gap-4 relative">
                    {/* Linha vertical conectora (exceto no último item) */}
                    {index !== recentActivity.length - 1 && (
                      <div className="absolute left-[19px] top-10 bottom-[-24px] w-[2px] bg-gray-100" />
                    )}
                    
                    <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${activity.color} border border-white shadow-sm`}>
                      <activity.icon className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-sm font-medium text-gray-900 leading-none">
                        {activity.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {activity.subtitle}
                      </span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(activity.date, { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Nenhuma atividade recente encontrada.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}