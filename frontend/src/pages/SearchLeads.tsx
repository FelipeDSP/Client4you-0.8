import { useState, useEffect } from "react";
import { LeadSearch } from "@/components/LeadSearch";
import { LeadRegionMap } from "@/components/LeadRegionMap";
import { LeadStats } from "@/components/LeadStats";
import { LeadFilters, LeadFilterState, defaultFilters, filterLeads } from "@/components/LeadFilters";
import { LeadTable } from "@/components/LeadTable";
import { Card } from "@/components/ui/card";
import { ExportButton } from "@/components/ExportButton";
import { QuotaLimitModal } from "@/components/QuotaLimitModal";
import { EnrichmentProgress } from "@/components/EnrichmentProgress";
import { useLeads, QuotaExhaustedError } from "@/hooks/useLeads";
import { useSegmentsAndTags } from "@/hooks/useSegmentsAndTags";
import { SaveToBaseDialog } from "@/components/leads/SaveToBaseDialog";
import { useQuotas } from "@/hooks/useQuotas";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { Lead } from "@/types";
import { Search, Loader2, Mail, ChevronLeft, ChevronRight, Database, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const LEADS_PER_PAGE = 20;

export default function SearchLeads() {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle("Buscar Leads", Search);
  }, [setPageTitle]);

  const [currentResults, setCurrentResults] = useState<Lead[]>([]);
  const [searchedLocation, setSearchedLocation] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnrichingPage, setIsEnrichingPage] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [filters, setFilters] = useState<LeadFilterState>(defaultFilters);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  const {
    quota,
    checkQuota,
    refresh: refreshQuota,
    canReenrich,
    reenrichRemaining,
    reenrichLimit,
  } = useQuotas();
  const [showQuotaModal, setShowQuotaModal] = useState(false);

  const {
    deleteLead,
    searchLeads,
    enrichEmails,
    saveLeadsToBase,
    isSavingToBase,
    enrichmentProgress,
  } = useLeads();
  const { toast } = useToast();
  const { addLeadsToSegment, addTagToLeads } = useSegmentsAndTags();
  const [isReenriching, setIsReenriching] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const handleSaveToBase = () => {
    if (selectedLeads.length === 0) return;
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async ({ segmentIds, tagIds }: { segmentIds: string[]; tagIds: string[] }) => {
    try {
      const result = await saveLeadsToBase(selectedLeads);
      const ids = result.baseLeadIds;

      // Vincula os leads (novos + os que já estavam na base) aos segmentos/etiquetas
      const ops: Promise<any>[] = [];
      if (ids.length > 0) {
        for (const segmentId of segmentIds) ops.push(addLeadsToSegment({ segmentId, leadIds: ids }));
        for (const tagId of tagIds) ops.push(addTagToLeads({ tagId, leadIds: ids }));
      }
      await Promise.all(ops);

      const parts: string[] = [`${result.saved} lead(s) salvos.`];
      if (result.skipped > 0) parts.push(`${result.skipped} já estava(m) na base.`);
      if (segmentIds.length > 0) parts.push(`Em ${segmentIds.length} segmento(s).`);
      if (tagIds.length > 0) parts.push(`${tagIds.length} etiqueta(s) aplicada(s).`);

      toast({
        title: result.saved > 0 ? "Adicionados à Base de Leads" : "Base atualizada",
        description: parts.join(" "),
        className: "border-l-4 border-green-500",
      });
      setSelectedLeads([]);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: (e as Error).message || "Tente novamente.",
      });
      throw e;
    }
  };

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
    } catch (e) {
      if (e instanceof QuotaExhaustedError) {
        toast({
          variant: "destructive",
          title: "Limite de enriquecimento atingido",
          description: `${e.detail.used}/${e.detail.limit} usados este mês. Faça upgrade pra continuar.`,
        });
        setShowQuotaModal(true);
      }
      return leads;
    } finally {
      setIsEnrichingPage(false);
      refreshQuota(); // pega contador novo do servidor
    }
  };

  const handleReenrich = async () => {
    // Só leads selecionados que já têm email (não faz sentido reenriquecer vazio)
    const targets = currentResults.filter(
      (l) => selectedLeads.includes(l.id) && l.website
    );
    if (targets.length === 0) {
      toast({
        title: "Nenhum lead pra reenriquecer",
        description: "Selecione leads com site cadastrado.",
      });
      return;
    }
    if (targets.length > reenrichRemaining) {
      toast({
        variant: "destructive",
        title: "Sub-quota insuficiente",
        description: `Você tem ${reenrichRemaining}/${reenrichLimit} reenriquecimentos restantes — selecionou ${targets.length}.`,
      });
      return;
    }

    setIsReenriching(true);
    try {
      const updated = await enrichEmails(
        targets.map((l) => l.id),
        { force: true }
      );
      // Aplica resultado localmente (mesma lógica do autoEnrich)
      if (updated.length > 0) {
        setCurrentResults((prev) =>
          prev.map((lead) => {
            const u = updated.find((x: any) => x.id === lead.id);
            return u ? { ...lead, email: u.email } : lead;
          })
        );
      }
      const cacheHits = updated.filter((u: any) => u.cached).length;
      toast({
        title: "Reenriquecimento concluído",
        description: `${updated.length}/${targets.length} atualizados. ${cacheHits} pelo cache.`,
        className: "border-l-4 border-purple-500",
      });
    } catch (e) {
      if (e instanceof QuotaExhaustedError) {
        toast({
          variant: "destructive",
          title: "Sub-quota de reenriquecimento esgotada",
          description: `${e.detail.used}/${e.detail.limit} usados. Aguarde o ciclo ou peça upgrade.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erro no reenriquecimento",
          description: (e as Error)?.message || "Tente novamente.",
        });
      }
    } finally {
      setIsReenriching(false);
      refreshQuota();
    }
  };

  const handleSearch = async (term: string, location: string, limit: number | null) => {
    // Pré-flight de UX: mostra o modal de limite antes de bater no servidor.
    // O enforcement REAL acontece no backend (não dá pra burlar pelo cliente).
    const quotaCheck = await checkQuota('lead_search');
    if (!quotaCheck.allowed) {
      setShowQuotaModal(true);
      return;
    }

    setCurrentResults([]);
    setSearchedLocation(location);
    setHasSearched(true);
    setIsProcessing(true);
    setCurrentPage(1);
    setFetchStatus("Buscando...");

    try {
      // Chamada única — o DataForSEO retorna tudo de uma vez (até o teto que o
      // backend deriva da quota restante).
      const result = await searchLeads(term, location, limit);
      const leads = result?.leads || [];
      setCurrentResults(leads);

      // O backend já incrementou a quota pelo nº de leads. Sincroniza o cache.
      refreshQuota();

      setFetchStatus(`Extraindo e-mails de ${leads.filter(l => l.website).length} sites...`);
      const enriched = await autoEnrichEmails(leads);
      setCurrentResults(enriched);

      const emailCount = enriched.filter(l => l.email).length;
      toast({
        title: "Busca Concluída",
        description: `${enriched.length} leads encontrados${emailCount > 0 ? `. ${emailCount} com e-mail.` : "."}`,
        className: "border-l-4 border-green-500",
      });
    } catch (e) {
      const msg = (e as Error).message || "Tente novamente.";
      // Limite estourado no servidor → abre o modal de upgrade
      if (/limite/i.test(msg)) {
        setShowQuotaModal(true);
      } else {
        toast({ variant: "destructive", title: "Erro na busca", description: msg });
      }
      refreshQuota();
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
              <>
                {/* Botão Reenriquecer — só plano intermediário+ com sub-quota */}
                {canReenrich ? (
                  <Button
                    onClick={handleReenrich}
                    disabled={isReenriching || isBusy}
                    variant="outline"
                    className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                    title={`${reenrichRemaining}/${reenrichLimit} reenriquecimentos restantes este mês`}
                  >
                    {isReenriching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Reenriquecer ({selectedLeads.length}) · {reenrichRemaining}/{reenrichLimit}
                  </Button>
                ) : reenrichLimit === 0 ? null : (
                  <Button
                    disabled
                    variant="outline"
                    className="gap-2 opacity-60"
                    title="Você usou todos os reenriquecimentos deste mês"
                  >
                    <Sparkles className="h-4 w-4" />
                    Reenriquecer (0/{reenrichLimit})
                  </Button>
                )}
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
              </>
            )}
            <ExportButton leads={filteredLeads} selectedLeads={selectedLeads} />
          </div>
        )}
      </div>

      {/* Barra de progresso do batch async — visível durante enrichment/reenrichment */}
      {enrichmentProgress && <EnrichmentProgress progress={enrichmentProgress} />}

      {/* Filtros de busca */}
      <LeadSearch onSearch={handleSearch} isSearching={isBusy} />

      {/* Resultados (esquerda) + Mapa e dados (rail direito) */}
      {hasSearched && (currentResults.length > 0 || isBusy) && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* ── Coluna esquerda: resultados ── */}
          <Card className="p-5 bg-white shadow-sm border-none rounded-xl min-w-0">
            {/* Header: contagem + status + paginação topo */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 flex-wrap">
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
                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200 self-start md:self-auto">
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

            {/* Filtros de resultado (nome + avançados) */}
            {currentResults.length > 0 && (
              <div className="mb-4">
                <LeadFilters
                  leads={currentResults}
                  filters={filters}
                  onFiltersChange={setFilters}
                />
              </div>
            )}

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

          {/* ── Coluna direita: mapa + dados (sticky) ── */}
          <div className="space-y-6 lg:sticky lg:top-6">
            {searchedLocation && (
              <LeadRegionMap
                location={searchedLocation}
                leads={currentResults}
                count={currentResults.length}
              />
            )}
            {currentResults.length > 0 && <LeadStats leads={currentResults} />}
          </div>
        </div>
      )}

      {hasSearched && !isBusy && currentResults.length === 0 && (
        <Card className="p-12 bg-white shadow-sm border-none rounded-xl text-center">
          <p className="text-muted-foreground">Nenhum lead encontrado.</p>
        </Card>
      )}

      <QuotaLimitModal
        open={showQuotaModal}
        onOpenChange={setShowQuotaModal}
      />

      <SaveToBaseDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        leadCount={selectedLeads.length}
        onConfirm={handleConfirmSave}
      />
    </div>
  );
}
