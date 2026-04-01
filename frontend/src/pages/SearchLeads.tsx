import { useState, useEffect } from "react";
import { LeadSearch } from "@/components/LeadSearch";
import { LeadFilters, LeadFilterState, defaultFilters, filterLeads } from "@/components/LeadFilters";
import { LeadTable } from "@/components/LeadTable";
import { Card } from "@/components/ui/card";
import { ExportButton } from "@/components/ExportButton";
import { CreateCampaignFromLeads } from "@/components/CreateCampaignFromLeads";
import { QuotaLimitModal } from "@/components/QuotaLimitModal";
import { ConfigurationAlert } from "@/components/ConfigurationAlert";
import { useLeads } from "@/hooks/useLeads";
import { useQuotas } from "@/hooks/useQuotas";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { Lead } from "@/types";
import { Search, ArrowDown, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export default function SearchLeads() {
  const { setPageTitle } = usePageTitle();
  
  useEffect(() => {
    setPageTitle("Buscar Leads", Search);
  }, [setPageTitle]);

  const [currentResults, setCurrentResults] = useState<Lead[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // --- SISTEMA DE CACHE DE PÁGINAS ---
  // Guarda os leads de cada página: { 1: [...leads], 2: [...leads] }
  const [pagesCache, setPagesCache] = useState<Record<number, Lead[]>>({});
  
  // PAGINAÇÃO
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState("");
  const [currentLocation, setCurrentLocation] = useState("");
  
  const [filters, setFilters] = useState<LeadFilterState>(defaultFilters);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  
  const { quota, checkQuota, incrementQuota } = useQuotas();
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  
  const { settings, isLoading: isLoadingSettings, hasSerpapiKey, refreshSettings } = useCompanySettings();
  const hasSerpApi = hasSerpapiKey;
  
  const { deleteLead, searchLeads, validateLeads } = useLeads();
  const { toast } = useToast();

  useEffect(() => {
    refreshSettings();
  }, []);

  // Atualiza o cache quando um lead é deletado para não voltar a aparecer
  const handleLocalDelete = async (id: string) => {
    // 1. Deleta do banco
    await deleteLead(id);
    
    // 2. Remove da visualização atual
    setCurrentResults(prev => prev.filter(l => l.id !== id));

    // 3. Remove do cache de TODAS as páginas (para não voltar se trocar de página)
    setPagesCache(prevCache => {
      const newCache = { ...prevCache };
      Object.keys(newCache).forEach(pageKey => {
        const pageNum = Number(pageKey);
        newCache[pageNum] = newCache[pageNum].filter(l => l.id !== id);
      });
      return newCache;
    });
  };

  // Função auxiliar para validar e processar
  const processLeadsWithValidation = async (rawLeads: Lead[]) => {
    if (rawLeads.length === 0) return rawLeads;

    try {
      const ids = rawLeads.map(l => l.id);
      const updatedStatus = await validateLeads(ids);
      
      if (updatedStatus && updatedStatus.length > 0) {
        return rawLeads.map(lead => {
          const isUpdated = updatedStatus.find((u: any) => u.id === lead.id);
          return isUpdated ? { ...lead, hasWhatsApp: true } : lead;
        });
      }
    } catch (error) {
      console.error("Erro na validação:", error);
    }
    return rawLeads; // Retorna com validação ou originais se falhar
  };

  // BUSCA INICIAL (Reset Total)
  const handleSearch = async (term: string, location: string) => {
    const quotaCheck = await checkQuota('lead_search');
    
    if (!quotaCheck.allowed) {
      setShowQuotaModal(true);
      return;
    }
    
    // Limpa TUDO: cache, resultados, paginação
    setCurrentResults([]);
    setPagesCache({}); 
    setHasSearched(true);
    setHasMore(false);
    setCurrentPage(1);
    setIsProcessing(true);
    
    try {
      const result = await searchLeads(term, location, 0);
      
      if (result && result.leads) {
        // Valida
        const validatedLeads = await processLeadsWithValidation(result.leads);
        
        // Atualiza Estado Atual e Cache da Página 1
        setCurrentResults(validatedLeads);
        setPagesCache({ 1: validatedLeads });
        
        setHasMore(result.leads.length === 20);
        setCurrentSearchId(result.searchId);
        setCurrentQuery(result.query);
        setCurrentLocation(result.location);
        
        await incrementQuota('lead_search');

        const whatsCount = validatedLeads.filter(l => l.hasWhatsApp).length;
        if (whatsCount > 0) {
          toast({
            title: "Busca Concluída",
            description: `${result.leads.length} leads encontrados. ${whatsCount} com WhatsApp.`,
            className: "border-l-4 border-green-500"
          });
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // MUDANÇA DE PÁGINA (Com Cache)
  const handlePageChange = async (newPage: number) => {
    if (!currentSearchId || isProcessing) return;
    
    // 1. Verifica se a página já está no cache
    if (pagesCache[newPage]) {
      console.log(`Carregando página ${newPage} do cache...`);
      setCurrentResults(pagesCache[newPage]);
      setCurrentPage(newPage);
      
      // Scroll suave para o topo
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }

    // 2. Se não estiver no cache, busca na API
    setIsProcessing(true);
    const nextStart = (newPage - 1) * 20;
    
    try {
      // Feedback visual de carregamento (limpa lista momentaneamente)
      setCurrentResults([]); 

      const result = await searchLeads(currentQuery, currentLocation, nextStart, currentSearchId);
      
      if (result && result.leads) {
        const validatedLeads = await processLeadsWithValidation(result.leads);
        
        // Salva no Cache e Atualiza a Tela
        setPagesCache(prev => ({ ...prev, [newPage]: validatedLeads }));
        setCurrentResults(validatedLeads);
        
        setHasMore(result.leads.length === 20);
        setCurrentPage(newPage);
        
        window.scrollTo({ top: 100, behavior: 'smooth' });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredLeads = filterLeads(currentResults, filters);

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
            <ExportButton 
              leads={filteredLeads} 
              selectedLeads={selectedLeads} 
            />
            <CreateCampaignFromLeads
              leads={filteredLeads}
              selectedLeads={selectedLeads}
            />
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
            isSearching={isProcessing && currentPage === 1}
            disabled={!hasSerpApi}
          />
          
          {hasSearched && (
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

      {hasSearched && (
        <Card className="p-6 bg-white shadow-sm border-none rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* HEADER DA TABELA + PAGINAÇÃO NO TOPO */}
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
            
            <div className="flex items-center gap-2">
              <ArrowDown className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-lg">
                {isProcessing && currentResults.length === 0 
                  ? "Carregando..." 
                  : `${filteredLeads.length} Leads na Página ${currentPage}`}
              </h3>
              
              {isProcessing && (
                <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full animate-pulse border border-orange-100 ml-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Buscando e Validando...
                </span>
              )}
            </div>

            {/* Navegação Topo */}
            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isProcessing}
                className="h-8 w-8 p-0 hover:bg-white hover:shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="px-3 text-sm font-medium text-slate-600 border-x border-slate-200 h-6 flex items-center bg-white shadow-sm rounded-sm">
                Página {currentPage}
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                // Habilita "Próxima" se tiver mais, OU se a próxima página já estiver no cache
                disabled={(!hasMore && !pagesCache[currentPage + 1]) || isProcessing}
                className="h-8 w-8 p-0 hover:bg-white hover:shadow-sm"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* TABELA */}
          <LeadTable
            leads={filteredLeads}
            selectedLeads={selectedLeads}
            onSelectionChange={setSelectedLeads}
            onDelete={handleLocalDelete} // Usa a nova função de deletar local
            isLoading={isProcessing && currentResults.length === 0}
          />
          
          {/* Navegação Rodapé */}
          {currentResults.length > 0 && (
            <div className="mt-6 pt-4 border-t flex justify-center">
               <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || isProcessing}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                
                <span className="text-sm text-muted-foreground">
                  Página {currentPage}
                </span>
                
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={(!hasMore && !pagesCache[currentPage + 1]) || isProcessing}
                  className="gap-2"
                >
                  Próxima <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {hasSearched && currentResults.length === 0 && !isProcessing && (
        <Card className="p-12 bg-white shadow-sm border-none rounded-xl text-center">
          <p className="text-muted-foreground">
            Nenhum lead encontrado nesta página.
          </p>
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