import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { Lead } from "@/types";
import { useToast } from "@/components/ui/use-toast";

interface ExportButtonProps {
  leads: Lead[];
  selectedLeads?: string[];
}

// Função auxiliar para separar Endereço de Cidade/Estado
const splitAddress = (fullAddress: string) => {
  if (!fullAddress) return { location: "", cityState: "" };

  // Tenta encontrar o padrão ", Cidade - UF" (comum no Brasil)
  // Ex: "Rua X, 123 - Bairro, Cidade - SP"
  // Captura o que está antes de " - UF" sendo a cidade
  const match = fullAddress.match(/, ([^,]+?) - ([A-Z]{2})/);

  if (match) {
    const city = match[1];
    const state = match[2];
    // Pega tudo antes da virgula que precede a cidade
    const location = fullAddress.substring(0, match.index).trim();
    
    return { 
      location: location, 
      cityState: `${city} - ${state}` 
    };
  }

  // Fallback: Se não achar o padrão exato, retorna tudo no endereço e deixa cidade vazia
  // ou tenta pegar só o final se for "Cidade - UF"
  if (fullAddress.match(/^([^,]+?) - ([A-Z]{2})/)) {
     return { location: "", cityState: fullAddress };
  }

  return { location: fullAddress, cityState: "" };
};

export function ExportButton({ leads, selectedLeads = [] }: ExportButtonProps) {
  const { toast } = useToast();

  const handleExport = () => {
    const leadsToExport = selectedLeads.length > 0
      ? leads.filter(l => selectedLeads.includes(l.id))
      : leads;

    if (leadsToExport.length === 0) {
      toast({
        title: "Nada para exportar",
        description: "Não há leads na lista para gerar o arquivo.",
        variant: "destructive",
      });
      return;
    }

    const data = leadsToExport.map((lead) => {
      // Aplica a separação do endereço
      const addressInfo = splitAddress(lead.address);

      return {
        "Nome da Empresa": lead.name,
        "Categoria": lead.category || "Geral",
        "Telefone": lead.phone || "",
        "WhatsApp": lead.hasWhatsApp ? "Sim" : "Não",
        "Endereço (Local)": addressInfo.location,     // <--- Nova Coluna
        "Cidade/Estado": addressInfo.cityState,       // <--- Nova Coluna
        "Endereço Completo": lead.address,            // Mantemos o original por segurança
        "Nota (Rating)": lead.rating || "",
        "Website": lead.website || "",
        "Data Extração": new Date().toLocaleDateString("pt-BR"),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");

    // Ajusta largura das colunas
    const colWidths = Object.keys(data[0]).map((key) => ({
      wch: Math.max(key.length, 20),
    }));
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, `leads_exportados_${new Date().toISOString().split("T")[0]}.xlsx`);

    toast({
      title: "Download iniciado",
      description: `${leadsToExport.length} leads foram exportados com sucesso.`,
    });
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleExport}
      className="gap-2 bg-white hover:bg-gray-50 text-gray-700 border-gray-200"
    >
      <Download className="h-4 w-4 text-green-600" />
      Exportar Excel
    </Button>
  );
}