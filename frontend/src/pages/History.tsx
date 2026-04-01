import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { useLeads } from "@/hooks/useLeads";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { LeadTable } from "@/components/LeadTable";
import { Search, MapPin, Calendar, Hash, Trash2, Eye, Download, History as HistoryIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SearchHistory, Lead } from "@/types";

export default function History() {
  const { setPageTitle } = usePageTitle();
  
  useEffect(() => {
    setPageTitle("Histórico", HistoryIcon);
  }, [setPageTitle]);

  const { searchHistory, getLeadsBySearchId, deleteSearchHistory, clearAllHistory } = useLeads();
  const { toast } = useToast();
  
  const [selectedSearch, setSelectedSearch] = useState<SearchHistory | null>(null);
  const [searchLeads, setSearchLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const handleViewSearch = (search: SearchHistory) => {
    const leads = getLeadsBySearchId(search.id);
    setSearchLeads(leads);
    setSelectedSearch(search);
    setSelectedLeadIds([]);
  };

  const handleDeleteSearch = (searchId: string) => {
    deleteSearchHistory(searchId);
    toast({
      title: "Pesquisa removida",
      description: "A pesquisa e seus leads foram removidos do histórico.",
    });
  };

  const handleClearAll = () => {
    clearAllHistory();
    toast({
      title: "Histórico limpo",
      description: "Todo o histórico foi removido com sucesso.",
    });
  };

  // Mesma lógica de separação de endereço
  const splitAddress = (fullAddress: string) => {
    if (!fullAddress) return { location: "", cityState: "" };
    const match = fullAddress.match(/, ([^,]+?) - ([A-Z]{2})/);
    if (match) {
      return { 
        location: fullAddress.substring(0, match.index).trim(), 
        cityState: `${match[1]} - ${match[2]}` 
      };
    }
    if (fullAddress.match(/^([^,]+?) - ([A-Z]{2})/)) {
       return { location: "", cityState: fullAddress };
    }
    return { location: fullAddress, cityState: "" };
  };

  const handleDownloadLeads = (search: SearchHistory, leadsToExport?: Lead[]) => {
    const leads = leadsToExport || getLeadsBySearchId(search.id);
    
    if (leads.length === 0) {
      toast({
        title: "Nenhum lead disponível",
        description: "Não há leads para exportar.",
        variant: "destructive",
      });
      return;
    }

    const data = leads.map((lead) => {
      const addressInfo = splitAddress(lead.address);
      return {
        "Nome": lead.name,
        "Categoria": lead.category,
        "Telefone": lead.phone,
        "WhatsApp": lead.hasWhatsApp ? "Sim" : "Não",
        "Endereço (Local)": addressInfo.location,   // <--- Separado
        "Cidade/Estado": addressInfo.cityState,     // <--- Separado
        "Endereço Completo": lead.address,          // Mantido
        "Avaliação": lead.rating,
        "Website": lead.website || "",
        "Data": new Date(lead.extractedAt).toLocaleDateString("pt-BR"),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");

    const colWidths = Object.keys(data[0]).map((key) => ({
      wch: Math.max(key.length, 15),
    }));
    worksheet["!cols"] = colWidths;

    const sanitizedQuery = search.query.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const fileName = `leads_${sanitizedQuery}_${new Date(search.searchedAt).toISOString().split("T")[0]}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);

    toast({
      title: "Download concluído!",
      description: `${leads.length} leads exportados com sucesso.`,
    });
  };

  const handleModalDownload = () => {
    if (!selectedSearch) return;
    const leadsToExport = selectedLeadIds.length > 0
      ? searchLeads.filter(l => selectedLeadIds.includes(l.id))
      : searchLeads;
    handleDownloadLeads(selectedSearch, leadsToExport);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-800">Histórico</h2>
          <p className="text-muted-foreground mt-1">Veja e gerencie suas buscas anteriores.</p>
        </div>

        {searchHistory.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Limpar Histórico
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação irá remover todas as {searchHistory.length} pesquisas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAll}>
                  Sim, limpar tudo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {searchHistory.length === 0 ? (
        <Card className="bg-white shadow-sm border-none">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma busca realizada ainda</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {searchHistory.map((search) => (
            <Card key={search.id} className="bg-white shadow-sm border-none hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                    <Search className="h-4 w-4 text-primary" />
                    {search.query}
                  </CardTitle>
                  <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                    <Hash className="h-3 w-3 mr-1" />
                    {search.resultsCount}
                  </Badge>
                </div>
                <CardDescription className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {search.location}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="h-3 w-3 mr-1" />
                  {formatDistanceToNow(new Date(search.searchedAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => handleViewSearch(search)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Ver Leads
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownloadLeads(search)}
                    title="Baixar Excel Completo"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover pesquisa?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remover "{search.query}"?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteSearch(search.id)}>
                          Sim, remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedSearch} onOpenChange={(open) => !open && setSelectedSearch(null)}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-white">
          <DialogHeader className="p-6 pb-2 flex-none">
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Search className="h-5 w-5 text-primary" />
                  Resultados: {selectedSearch?.query}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-xs">
                    <MapPin className="h-3 w-3" />
                    {selectedSearch?.location}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {searchLeads.length} leads encontrados
                  </span>
                </DialogDescription>
              </div>
              
              {searchLeads.length > 0 && selectedSearch && (
                <Button 
                  size="sm" 
                  variant={selectedLeadIds.length > 0 ? "default" : "outline"}
                  onClick={handleModalDownload}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  {selectedLeadIds.length > 0 
                    ? `Baixar Selecionados (${selectedLeadIds.length})` 
                    : "Baixar Todos"}
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden p-2 bg-gray-50/30">
            <div className="h-full border rounded-lg bg-white overflow-y-auto">
              <LeadTable 
                leads={searchLeads} 
                selectedLeads={selectedLeadIds}
                onSelectionChange={setSelectedLeadIds}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}