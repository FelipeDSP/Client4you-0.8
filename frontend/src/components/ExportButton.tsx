import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { Lead } from "@/types";
import { useToast } from "@/components/ui/use-toast";

interface ExportButtonProps {
  leads: Lead[];
  selectedLeads?: string[];
}

const splitAddress = (fullAddress: string) => {
  if (!fullAddress) return { location: "", cityState: "" };

  const match = fullAddress.match(/, ([^,]+?) - ([A-Z]{2})/);
  if (match) {
    const city = match[1];
    const state = match[2];
    const location = fullAddress.substring(0, match.index).trim();
    return { location, cityState: `${city} - ${state}` };
  }

  if (fullAddress.match(/^([^,]+?) - ([A-Z]{2})/)) {
    return { location: "", cityState: fullAddress };
  }

  return { location: fullAddress, cityState: "" };
};

const downloadBlob = (buffer: ArrayBuffer, filename: string) => {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
      const { location, cityState } = splitAddress(lead.address);
      return {
        "Nome da Empresa": lead.name,
        "Categoria": lead.category || "Geral",
        "Telefone": lead.phone || "",
        "E-mail": lead.email || "",
        "Website": lead.website || "",
        "Endereço": location,
        "Cidade/Estado": cityState,
        "Endereço Completo": lead.address,
        "Nota": lead.rating || "",
        "Avaliações": lead.reviews || "",
        "Data Extração": new Date().toLocaleDateString("pt-BR"),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");

    // Ajusta largura das colunas pelo maior conteúdo
    const colWidths = Object.keys(data[0]).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...leadsToExport.map(l => String((data[0] as any)[key] ?? "").length)
      );
      return { wch: Math.min(maxLen + 2, 50) };
    });
    worksheet["!cols"] = colWidths;

    // Usa write + Blob para garantir compatibilidade com browser
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const filename = `leads_${new Date().toISOString().split("T")[0]}.xlsx`;
    downloadBlob(buffer, filename);

    toast({
      title: "Download iniciado",
      description: `${leadsToExport.length} leads exportados.`,
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
