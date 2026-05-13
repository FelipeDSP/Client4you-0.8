import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Trash2,
  MapPin,
  Star,
  Globe,
  Phone,
  Mail,
} from "lucide-react";
import { Lead } from "@/types";
import { Badge } from "@/components/ui/badge";

interface LeadTableProps {
  leads: Lead[];
  onDelete?: (id: string) => void;
  selectedLeads?: string[];
  onSelectionChange?: (ids: string[]) => void;
  isLoading?: boolean;
}

const formatWebsite = (url: string) => {
  try {
    const domain = new URL(url).hostname;
    return domain.replace(/^www\./, '');
  } catch (e) {
    return "Visitar";
  }
};

export function LeadTable({
  leads,
  onDelete,
  selectedLeads = [],
  onSelectionChange,
  isLoading,
}: LeadTableProps) {

  const currentPageIds = leads.map(l => l.id);
  const allCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every(id => selectedLeads.includes(id));
  const someCurrentPageSelected =
    currentPageIds.some(id => selectedLeads.includes(id)) && !allCurrentPageSelected;

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allCurrentPageSelected) {
      // Remove apenas os da página atual, mantém os de outras páginas
      const pageSet = new Set(currentPageIds);
      onSelectionChange(selectedLeads.filter(id => !pageSet.has(id)));
    } else {
      // Adiciona os da página atual sem duplicar os já selecionados
      const existingSet = new Set(selectedLeads);
      const toAdd = currentPageIds.filter(id => !existingSet.has(id));
      onSelectionChange([...selectedLeads, ...toAdd]);
    }
  };

  const toggleSelectOne = (id: string) => {
    if (!onSelectionChange) return;
    if (selectedLeads.includes(id)) {
      onSelectionChange(selectedLeads.filter((leadId) => leadId !== id));
    } else {
      onSelectionChange([...selectedLeads, id]);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center space-y-4">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-4 w-48 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-2 w-full">
            <div className="h-12 bg-gray-100 rounded w-full"></div>
            <div className="h-12 bg-gray-100 rounded w-full"></div>
            <div className="h-12 bg-gray-100 rounded w-full"></div>
          </div>
        </div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground bg-slate-50 rounded-lg border border-dashed border-slate-200">
        Nenhum lead para exibir. Faça uma nova busca.
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 shadow-sm bg-white">
      <Table>
        <TableHeader className="bg-blue-900">
          <TableRow className="hover:bg-blue-900/90 border-none">
            <TableHead className="w-[40px] pl-4">
              <Checkbox
                checked={allCurrentPageSelected ? true : someCurrentPageSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
                className="border-white/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary/50 data-[state=indeterminate]:border-primary/50"
              />
            </TableHead>
            <TableHead className="min-w-[200px] font-semibold text-white/90">Empresa</TableHead>
            <TableHead className="min-w-[140px] font-semibold text-white/90">Telefone</TableHead>
            <TableHead className="min-w-[180px] font-semibold text-white/90">E-mail</TableHead>
            <TableHead className="min-w-[140px] font-semibold text-white/90">Site</TableHead>
            <TableHead className="min-w-[180px] font-semibold text-white/90">Endereço</TableHead>
            <TableHead className="w-[80px] text-center font-semibold text-white/90">Nota</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow
              key={lead.id}
              className={`hover:bg-slate-50/80 group h-14 text-sm border-b border-slate-100 transition-colors ${selectedLeads.includes(lead.id) ? 'bg-orange-50/30' : ''}`}
            >
              <TableCell className="pl-4">
                <Checkbox
                  checked={selectedLeads.includes(lead.id)}
                  onCheckedChange={() => toggleSelectOne(lead.id)}
                  className="border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </TableCell>

              {/* Nome */}
              <TableCell className="py-2">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={lead.name}>
                    {lead.name}
                  </span>
                  <span className="text-xs text-slate-400 capitalize truncate max-w-[200px]">
                    {lead.category?.toLowerCase() || "Negócio Local"}
                  </span>
                </div>
              </TableCell>

              {/* Telefone */}
              <TableCell className="py-2">
                {lead.phone ? (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-mono text-slate-600 tracking-tight whitespace-nowrap font-medium">
                      {lead.phone}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-300 text-xs italic">Sem telefone</span>
                )}
              </TableCell>

              {/* E-mail */}
              <TableCell className="py-2">
                {lead.email ? (
                  <div className="flex items-center gap-1.5 max-w-[180px]" title={lead.email}>
                    <Mail className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    <span className="truncate text-xs text-slate-600 font-medium">{lead.email}</span>
                  </div>
                ) : (
                  <span className="text-slate-300 text-xs pl-1">-</span>
                )}
              </TableCell>

              {/* Site */}
              <TableCell className="py-2">
                {lead.website ? (
                  <a
                    href={lead.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors group/link max-w-[140px] hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover/link:opacity-100" />
                    <span className="truncate text-xs font-medium">
                      {formatWebsite(lead.website)}
                    </span>
                  </a>
                ) : (
                  <span className="text-slate-300 text-xs pl-2">-</span>
                )}
              </TableCell>

              {/* Endereço */}
              <TableCell className="py-2">
                <div className="flex items-center gap-1.5 text-slate-500 max-w-[180px]" title={lead.address}>
                  <MapPin className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  <span className="truncate text-xs">
                    {lead.address || "Endereço não disponível"}
                  </span>
                </div>
              </TableCell>

              {/* Nota */}
              <TableCell className="text-center py-2">
                {lead.rating > 0 ? (
                  <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100 gap-1 font-bold">
                    {lead.rating.toFixed(1)}
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  </Badge>
                ) : (
                  <span className="text-slate-300 text-xs">-</span>
                )}
              </TableCell>

              {/* Ações */}
              <TableCell className="text-right py-2 pr-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all"
                  onClick={() => onDelete && onDelete(lead.id)}
                  title="Remover Lead"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
