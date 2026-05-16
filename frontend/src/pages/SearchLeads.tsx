import { useState, useEffect } from "react";
import { LeadSearch } from "@/components/LeadSearch";
import { LeadFilters, LeadFilterState, defaultFilters, filterLeads } from "@/components/LeadFilters";
import { LeadTable } from "@/components/LeadTable";
import { Card } from "@/components/ui/card";
import { ExportButton } from "@/components/ExportButton";
import { QuotaLimitModal } from "@/components/QuotaLimitModal";
import { ConfigurationAlert } from "@/components/ConfigurationAlert";
import { useLeads } from "@/hooks/useLeads";
import { useQuotas } from "@/hooks/useQuotas";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { Lead } from "@/types";
import { Search, ArrowDown, Loader2, Mail, ChevronLeft, ChevronRight, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const LEADS_PER_PAGE = 20;

export default function SearchLeads() {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle("Buscar Leads", Search);
  }, [setPageTitle]);

  const [currentResults, setCurrentResults] = useState<Lead[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnrichingPage, setIsEnrichingPage] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [filters, setFilters] = useState<LeadFilterState>(defaultFilters);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  const { quota, checkQuota, incrementQuota } = useQuotas();
  const [showQuotaModal, setShowQuotaModal] = useState(false);

  const { isLoading: isLoadingSettings, hasSerpapiKey, refreshSettings } = useCompanySettings();
  const hasSerpApi = hasSerpapiKey;

  const { deleteLead, searchLeads, enrichEmails, saveLeadsToBase, isSavingToBase } = useLeads();
  const { toast } = useToast();

  const handleSaveToBase = async () => {
    if (selectedLeads.length === 0) return;
    try {
      const result = await saveLeadsToBase(selectedLeads);
      toast({
        title: "Adicionados à Base de Leads",
        description: `${result.saved} lead(s) salvos. Vá em Base de Leads para visualizar.`,
        className: "border-l-4 border-green-500",
      });
      setSelectedLeads([]);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: (e as Error).message || "Tente novamente.",
      });
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  // Volta para página 1 quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const handleLocalDelete = async (id: string) => {
    await deleteLead(id);
    setCurrentResults(prev => prev.filter(l => l.id !== id));
    setSelectedLeads(prev => prev.filter(sid => sid !== id));
  };

  const autoEnrichEmails = async (leads: Lead[]): Promise<Lead[]> => {
    const toEnrich = leads.filter(l => l.website && !l.email);
    if (toEnrich.length === 0) return leads;

    setIsEnrichingPage(true);
    try {
      const updated = await enrichEmails(toEnrich.map(l => l.id));
      if (updated.length === 0) return leads;
      return leads.map(lead => {
        const u = updated.find((u: any) => u.id === lead.id);
        return u ? { ...lead, email: u.email } : lead;
      });
    } catch {
      return leads;
    } finally {
      setIsEnrichingPage(false);
    }
  };

  const handleSearch = async (term: string, location: string, limit: number | null) => {
    const quotaCheck = await checkQuota('lead_search');
    if (!quotaCheck.allowed) {
      setShowQuotaModal(true);
      return;
    }

    setCurrentResults([]);
    setHasSearched(true);
    setIsProcessing(true);
    setCurrentPage(1);
    setFetchStatus("Buscando...");

    try {
      const allLeads: Lead[] = [];
      const seenIds = new Set<string>();
      let start = 0;
      let searchId: string | undefined = undefined;
      let page = 1;

      while (true) {
        // Para se atingiu o limite definido pelo usuário
        if (limit && allLeads.length >= limit) break;

        setFetchStatus(`Buscando página ${page}... (${allLeads.length} leads)`);

        const result = await searchLeads(term, location, start, searchId);
        if (!result || result.leads.length === 0) break;

        searchId = result.searchId;

        for (const lead of result.leads) {
          if (!seenIds.has(lead.id)) {
            // Respeita o limite na hora de acumular
            if (limit && allLeads.length >= limit) break;
            seenIds.add(lead.id);
            allLeads.push(lead);
          }
        }

        // Atualiza a tabela em tempo real
        setCurrentResults([...allLeads]);

        if (!result.hasMore) break;

        start += result.leads.length;
        page++;
      }

      await incrementQuota('lead_search');

      setFetchStatus(`Extraindo e-mails de ${allLeads.filter(l => l.website).length} sites...`);
      const enriched = await autoEnrichEmails(allLeads);
      setCurrentResults(enriched);

      const emailCount = enriched.filter(l => l.email).length;
      toast({
        title: "Busca Concluída",
        description: `${enriched.length} leads encontrados${emailCount > 0 ? `. ${emailCount} com e-mail.` : "."}`,
        className: "border-l-4 border-green-500",
      });
    } finally {
      setIsProcessing(false);
      setIsEnrichingPage(false);
      setFetchStatus("");
    }
  };

  // Mostra TODOS os leads (com ou sem email). O enrichment via Firecrawl
  // popula o campo email quando consegue extrair do website; a coluna fica
  // vazia pros que não tem.
  const filteredLeads = filterLeads(currentResults, filters);
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLeads = filteredLeads.slice(
    (safePage - 1) * LEADS_PER_PAGE,
    safePage * LEADS_PER_PAGE
  );
  const isBusy = isProcessing || isEnrichingPage;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-800">Buscar Leads</h2>
          <p className="text-muted-foreground mt-1">
            Encontre novos contatos em tempo real.
          </p>
        </div>

        {currentResults.length > 0 && (
          <div className="flex items-center gap-2">
            {selectedLeads.length > 0 && (
              <Button
                onClick={handleSaveToBase}
                disabled={isSavingToBase}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {isSavingToBase ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                Salvar na Base ({selectedLeads.length})
              </Button>
            )}
            <ExportButton leads={filteredLeads} selectedLeads={selectedLeads} />
          </div>
        )}
      </div>

      {!isLoadingSettings && !hasSerpApi && (
        <ConfigurationAlert type="serp" />
      )}

      <Card className="p-6 bg-white shadow-sm border-none rounded-xl">
        <div className="space-y-6">
          <LeadSearch
            onSearch={handleSearch}
            isSearching={isBusy}
            disabled={!hasSerpApi}
          />

          {hasSearched && currentResults.length > 0 && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500">
              <LeadFilters
                leads={currentResults}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>
          )}
        </div>
      </Card>

      {hasSearched && (currentResults.length > 0 || isBusy) && (
        <Card className="p-6 bg-white shadow-sm border-none rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">

          {/* Header */}
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <ArrowDown className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-lg">
                {filteredLeads.length > 0
                  ? `${filteredLeads.length} Lead${filteredLeads.length !== 1 ? "s" : ""}`
                  : isBusy ? "Carregando..." : "Nenhum lead encontrado"}
              </h3>

              {isProcessing && (
                <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full animate-pulse border border-orange-100">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {fetchStatus}
                </span>
              )}

              {!isProcessing && isEnrichingPage && (
                <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full animate-pulse border border-blue-100">
                  <Mail className="h-3 w-3" />
                  {fetchStatus || "Extraindo e-mails..."}
                </span>
              )}
            </div>

            {/* Paginação topo */}
            {filteredLeads.length > LEADS_PER_PAGE && (
              <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="h-8 w-8 p-0 hover:bg-white hover:shadow-sm"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="px-3 text-sm font-medium text-slate-600 border-x border-slate-200 h-6 flex items-center bg-white shadow-sm rounded-sm">
                  {safePage} / {totalPages}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="h-8 w-8 p-0 hover:bg-white hover:shadow-sm"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <LeadTable
            leads={paginatedLeads}
            selectedLeads={selectedLeads}
            onSelectionChange={setSelectedLeads}
            onDelete={handleLocalDelete}
            isLoading={isProcessing && currentResults.length === 0}
          />

          {/* Paginação rodapé */}
          {filteredLeads.length > LEADS_PER_PAGE && (
            <div className="mt-6 pt-4 border-t flex justify-center">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 100, behavior: 'smooth' }); }}
                  disabled={safePage === 1}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {safePage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 100, behavior: 'smooth' }); }}
                  disabled={safePage === totalPages}
                  className="gap-2"
                >
                  Próxima <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {hasSearched && !isBusy && currentResults.length === 0 && (
        <Card className="p-12 bg-white shadow-sm border-none rounded-xl text-center">
          <p className="text-muted-foreground">Nenhum lead encontrado.</p>
        </Card>
      )}

      <QuotaLimitModal
        open={showQuotaModal}
        onClose={() => setShowQuotaModal(false)}
        limitType="leads"
        currentPlan={quota?.plan_type || 'demo'}
        used={quota?.leads_used || 0}
        limit={quota?.leads_limit || 0}
      />
    </div>
  );
}
