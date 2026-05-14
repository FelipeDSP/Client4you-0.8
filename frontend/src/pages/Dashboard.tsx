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

      {/* Cards de KPI */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                <div className="text-2xl font-bold text-gray-800">{dashboardStats.total_leads}</div>
                <p className="text-xs text-muted-foreground mt-1">Contatos na base</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm border-none opacity-70">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Campanhas de Email</CardTitle>
            <Mail className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-400">—</div>
            <p className="text-xs text-muted-foreground mt-1">Em breve</p>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm border-none opacity-70">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Engajamento</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-400">—</div>
            <p className="text-xs text-muted-foreground mt-1">Em breve</p>
          </CardContent>
        </Card>
      </div>

      {/* Card informativo sobre evolução */}
      <Card className="bg-gradient-to-br from-blue-50 to-purple-50 border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <AlertCircle className="h-5 w-5" />
            Evolução da plataforma
          </CardTitle>
          <CardDescription className="text-blue-700">
            Estamos pivotando de outreach via WhatsApp para email + gestão completa de leads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-blue-900">
          <p>
            <strong>Em breve nesta tela:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-blue-800">
            <li>Campanhas de email com tracking de abertura e clique</li>
            <li>Segmentos e tags pra organizar sua base</li>
            <li>Lead scoring automático baseado em engajamento</li>
            <li>Timeline de atividades por lead</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
