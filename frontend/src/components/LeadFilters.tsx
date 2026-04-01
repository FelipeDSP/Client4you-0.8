import { useState, useMemo } from "react";
import { Filter, X, Search, Globe, MessageCircle, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Lead } from "@/types";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 1. Definição do Estado dos Filtros
export interface LeadFilterState {
  search: string;
  hasWhatsApp: boolean | null;
  hasWebsite: boolean | null; // Novo: Filtro de Site
  minRating: number;          // Novo: Nota mínima
  minReviews: number;         // Novo: Mínimo de avaliações
}

// 2. Props do Componente
interface LeadFiltersProps {
  leads: Lead[];
  filters: LeadFilterState;
  onFiltersChange: (filters: LeadFilterState) => void;
}

// 3. Estado Inicial
export const defaultFilters: LeadFilterState = {
  search: "",
  hasWhatsApp: null,
  hasWebsite: null,
  minRating: 0,
  minReviews: 0,
};

// 4. Componente Principal
export function LeadFilters({ leads, filters, onFiltersChange }: LeadFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.hasWhatsApp !== null) count++;
    if (filters.hasWebsite !== null) count++;
    if (filters.minRating > 0) count++;
    if (filters.minReviews > 0) count++;
    return count;
  }, [filters]);

  const handleReset = () => {
    onFiltersChange(defaultFilters);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Barra de Pesquisa */}
      <div className="relative flex-1 min-w-[200px] max-w-[400px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filtrar por nome na página atual..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="w-full pl-9 bg-white border-slate-200 focus:border-orange-500"
        />
      </div>

      {/* Botão de Filtros Avançados */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={`gap-2 ${activeFiltersCount > 0 ? 'border-orange-500 text-orange-600 bg-orange-50' : ''}`}>
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-orange-200 text-orange-800 hover:bg-orange-300">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-5" align="start">
          <div className="space-y-6">
            
            {/* Seção 1: Canais de Contato */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-slate-500 uppercase tracking-wider">Canais</h4>
              
              <div className="grid grid-cols-2 gap-4">
                {/* WhatsApp */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-600" />
                    <Label className="text-sm font-medium">WhatsApp</Label>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="hasWhatsApp"
                        checked={filters.hasWhatsApp === true}
                        onCheckedChange={(checked) => 
                          onFiltersChange({ ...filters, hasWhatsApp: checked ? true : null })
                        }
                      />
                      <Label htmlFor="hasWhatsApp" className="text-xs text-slate-600 font-normal">Possui</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="noWhatsApp"
                        checked={filters.hasWhatsApp === false}
                        onCheckedChange={(checked) => 
                          onFiltersChange({ ...filters, hasWhatsApp: checked ? false : null })
                        }
                      />
                      <Label htmlFor="noWhatsApp" className="text-xs text-slate-600 font-normal">Não possui</Label>
                    </div>
                  </div>
                </div>

                {/* Site */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-600" />
                    <Label className="text-sm font-medium">Site</Label>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="hasWebsite"
                        checked={filters.hasWebsite === true}
                        onCheckedChange={(checked) => 
                          onFiltersChange({ ...filters, hasWebsite: checked ? true : null })
                        }
                      />
                      <Label htmlFor="hasWebsite" className="text-xs text-slate-600 font-normal">Possui</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="noWebsite"
                        checked={filters.hasWebsite === false}
                        onCheckedChange={(checked) => 
                          onFiltersChange({ ...filters, hasWebsite: checked ? false : null })
                        }
                      />
                      <Label htmlFor="noWebsite" className="text-xs text-slate-600 font-normal">Não possui</Label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Seção 2: Qualidade (Rating) */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  <Label className="text-sm font-medium">Avaliação Mínima</Label>
                </div>
                <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {filters.minRating > 0 ? `${filters.minRating}+ ⭐` : "Qualquer"}
                </span>
              </div>
              <Slider
                value={[filters.minRating]}
                min={0}
                max={5}
                step={0.5}
                onValueChange={([val]) => onFiltersChange({ ...filters, minRating: val })}
                className="py-2"
              />
              <div className="flex justify-between text-[10px] text-slate-400 px-1">
                <span>0</span>
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
            </div>

            {/* Seção 3: Popularidade (Reviews) */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-600" />
                <Label className="text-sm font-medium">Mínimo de Avaliações</Label>
              </div>
              <Select 
                value={filters.minReviews.toString()} 
                onValueChange={(val) => onFiltersChange({ ...filters, minReviews: Number(val) })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Qualquer quantidade</SelectItem>
                  <SelectItem value="10">Mais de 10 avaliações</SelectItem>
                  <SelectItem value="50">Mais de 50 avaliações</SelectItem>
                  <SelectItem value="100">Mais de 100 avaliações (Estabelecido)</SelectItem>
                  <SelectItem value="500">Mais de 500 avaliações (Famoso)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botão de Limpar */}
            <Button 
              variant="secondary" 
              className="w-full mt-2 bg-slate-100 hover:bg-slate-200 text-slate-600"
              onClick={handleReset}
            >
              Limpar Todos os Filtros
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Badges de Filtros Ativos (Atalhos para remover) */}
      {filters.hasWhatsApp !== null && (
        <Badge variant="outline" className="gap-1 border-green-200 bg-green-50 text-green-700 pl-2 pr-1 py-1">
          {filters.hasWhatsApp ? "Com WhatsApp" : "Sem WhatsApp"}
          <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-green-100 rounded-full" onClick={() => onFiltersChange({ ...filters, hasWhatsApp: null })}>
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      )}
      
      {filters.hasWebsite !== null && (
        <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-700 pl-2 pr-1 py-1">
          {filters.hasWebsite ? "Com Site" : "Sem Site"}
          <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-blue-100 rounded-full" onClick={() => onFiltersChange({ ...filters, hasWebsite: null })}>
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      )}

      {filters.minRating > 0 && (
        <Badge variant="outline" className="gap-1 border-yellow-200 bg-yellow-50 text-yellow-700 pl-2 pr-1 py-1">
          {filters.minRating}+ Estrelas
          <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-yellow-100 rounded-full" onClick={() => onFiltersChange({ ...filters, minRating: 0 })}>
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      )}

      {(filters.search || activeFiltersCount > 0) && (
        <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 w-8 p-0 rounded-full hover:bg-slate-100" title="Limpar tudo">
          <X className="h-4 w-4 text-slate-400" />
        </Button>
      )}
    </div>
  );
}

// 5. Lógica de Filtragem Atualizada
export function filterLeads(leads: Lead[], filters: LeadFilterState): Lead[] {
  return leads.filter((lead) => {
    // 1. Busca por Texto (Nome ou Categoria)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesName = lead.name.toLowerCase().includes(searchLower);
      const matchesCategory = lead.category?.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesCategory) return false;
    }

    // 2. Filtro de WhatsApp
    if (filters.hasWhatsApp === true && !lead.hasWhatsApp) return false;
    if (filters.hasWhatsApp === false && lead.hasWhatsApp) return false;

    // 3. Filtro de Site (Novo)
    // Considera "com site" se o campo website existir e não for vazio
    const hasSite = Boolean(lead.website && lead.website.length > 0);
    if (filters.hasWebsite === true && !hasSite) return false;
    if (filters.hasWebsite === false && hasSite) return false;

    // 4. Filtro de Avaliação (Novo)
    if (lead.rating < filters.minRating) return false;

    // 5. Filtro de Reviews (Novo)
    if (lead.reviews < filters.minReviews) return false;

    return true;
  });
}