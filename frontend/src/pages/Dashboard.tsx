import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Search,
  LayoutDashboard,
  Mail,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { QuotaBar } from "@/components/QuotaBar";
import { PlanExpirationAlert } from "@/components/PlanExpirationAlert";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { ENABLE_CAMPAIGNS } from "@/lib/featureFlags";

/**
 * Dashboard — pós remoção do WhatsApp/Disparador.
 *
 * Mostra apenas total de leads + quotas hoje. Os cards de campanhas e
 * mensagens serão reintroduzidos na Fase 1 (email campaigns) com semântica
 * de email (delivered/opened/clicked).
 */
export default function Dashboard() {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle("Dashboard", LayoutDashboard);
  }, [setPageTitle]);

  const { stats: dashboardStats, isLoading: isLoadingStats } = useDashboardStats();

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Alerta de Expiração de Plano */}
      <PlanExpirationAlert />

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-800">Visão Geral</h2>
          <p className="text-muted-foreground mt-1">
            Gerencie sua base de leads e monitore o crescimento.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/search">
            <Button className="gap-2 shadow-sm">
              <Search className="h-4 w-4" />
              Buscar Leads
            </Button>
          </Link>
        </div>
      </div>

      {/* Quota Bar */}
      <QuotaBar />

      {/* Cards de KPI — 3 dos 4 são de campanha, condicionados à feature flag.
          Quando ENABLE_CAMPAIGNS=false, só "Total de Leads" aparece e o grid
          encolhe pra 1 coluna (card não fica esticado em desktop). */}
      <div className={
        ENABLE_CAMPAIGNS
          ? "grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          : "grid gap-4 md:grid-cols-1 max-w-md"
      }>
        <Card className="bg-white shadow-sm border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Leads</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-800">{dashboardStats.total_leads}</div>
                <p className="text-xs text-muted-foreground mt-1">Contatos na base</p>
              </>
            )}
          </CardContent>
        </Card>

        {ENABLE_CAMPAIGNS && (
          <>
            <Card className="bg-white shadow-sm border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Campanhas</CardTitle>
                <Mail className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold text-gray-800">{dashboardStats.total_campaigns}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {dashboardStats.active_campaigns} ativa(s)
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Emails Enviados</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold text-gray-800">{dashboardStats.total_messages_sent}</div>
                    <p className="text-xs text-muted-foreground mt-1">Total acumulado</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Enviados Hoje</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold text-gray-800">{dashboardStats.messages_sent_today}</div>
                    <p className="text-xs text-muted-foreground mt-1">Últimas 24h</p>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
