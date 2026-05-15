import { useState, useEffect, useMemo } from "react";
import {
  Database,
  Users,
  Mail,
  Phone,
  Globe,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Loader2,
} from "lucide-react";
import { LeadFilters, defaultFilters, filterLeads, LeadFilterState } from "@/components/LeadFilters";
import { LeadTable } from "@/components/LeadTable";
import { ExportButton } from "@/components/ExportButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLeads } from "@/hooks/useLeads";
import { usePageTitle } from "@/contexts/PageTitleContext";

const LEADS_PER_PAGE = 25;

/**
 * Base de Leads — visualiza TODOS os leads acumulados no banco
 * (acumulados pelas buscas via /search). Diferente de /search que
 * mostra o resultado da busca atual, esta página é a "fonte da verdade"
 * permanente da base.
 */
export default function LeadsDatabase() {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle("Base de Leads", Database);
  }, [setPageTitle]);

  const { leads, isLoading, deleteLead, clearAllLeads } = useLeads();

  const [filters, setFilters] = useState<LeadFilterState>(defaultFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  // Filter combinado: search + filters
  const filtered = useMemo(() => {
    let result = leads;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((l) =>
        [l.name, l.email, l.phone, l.category, l.address]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
    }
    return filterLeads(result, filters);
  }, [leads, search, filters]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / LEADS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (safePage - 1) * LEADS_PER_PAGE,
    safePage * LEADS_PER_PAGE
  );

  // Stats globais (base inteira, não filtrada)
  const stats = useMemo(
    () => ({
      total: leads.length,
      withEmail: leads.filter((l) => l.email).length,
      withWhatsApp: leads.filter((l) => l.hasWhatsApp).length,
      withWebsite: leads.filter((l) => l.website).length,
    }),
    [leads]
  );

  // Reset pra página 1 quando filtros ou busca mudam
  useEffect(() => {
    setPage(1);
  }, [filters, search]);

  const handleDelete = async (id: string) => {
    await deleteLead(id);
    setSelected((prev) => prev.filter((s) => s !== id));
  };

  const handleClearAll = async () => {
    await clearAllLeads();
    setSelected([]);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Base de Leads</h2>
          <p className="text-muted-foreground mt-1">
            Toda sua base de leads acumulada. Use a busca rápida ou os filtros pra encontrar.
          </p>
        </div>

        {leads.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 text-red-600 hover:text-red-700 border-red-200">
                <Trash2 className="h-4 w-4" />
                Limpar base
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar TODOS os leads?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação é permanente. Vai apagar {leads.length} leads e não pode ser desfeita.
                  Considere exportar antes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearAll}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Apagar tudo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total" value={stats.total} color="blue" />
        <StatCard icon={Mail} label="Com email" value={stats.withEmail} color="emerald" />
        <StatCard icon={Phone} label="Com WhatsApp" value={stats.withWhatsApp} color="green" />
        <StatCard icon={Globe} label="Com site" value={stats.withWebsite} color="purple" />
      </div>

      {/* Search + actions */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email, telefone, categoria..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2">
              {selected.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {selected.length} selecionado(s)
                </span>
              )}
              <ExportButton leads={filtered} selectedLeads={selected} />
            </div>
          </div>

          <LeadFilters
            leads={leads}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </CardContent>
      </Card>

      {/* Resultados */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <Database className="h-12 w-12 mx-auto text-muted-foreground/40" />
              {leads.length === 0 ? (
                <>
                  <h3 className="font-medium">Sua base ainda está vazia</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Vá em <strong>Buscar Leads</strong> pra começar a coletar contatos do Google
                    Maps.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-medium">Nenhum lead corresponde aos filtros</h3>
                  <p className="text-sm text-muted-foreground">
                    Limpe os filtros ou a busca pra ver todos os leads.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-slate-50/50 text-sm text-muted-foreground flex justify-between items-center">
                <span>
                  Mostrando {paginated.length} de {filtered.length}
                  {filtered.length < leads.length && (
                    <span className="ml-2 text-xs">(filtrado de {leads.length} total)</span>
                  )}
                </span>
                <span className="text-xs">
                  Página {safePage} de {totalPages}
                </span>
              </div>
              <LeadTable
                leads={paginated}
                selectedLeads={selected}
                onSelectionChange={setSelected}
                onDelete={handleDelete}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {filtered.length > LEADS_PER_PAGE && (
        <div className="flex justify-center items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm px-3">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-component: card de estatística ──────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "blue" | "emerald" | "green" | "purple";
}) {
  const colorMap = {
    blue: "text-blue-600 bg-blue-50",
    emerald: "text-emerald-600 bg-emerald-50",
    green: "text-green-600 bg-green-50",
    purple: "text-purple-600 bg-purple-50",
  } as const;
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {label}
          </span>
          <div className={`p-1.5 rounded ${colorMap[color]}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900">{value.toLocaleString("pt-BR")}</div>
      </CardContent>
    </Card>
  );
}
