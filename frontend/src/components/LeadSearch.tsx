import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Loader2, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LeadSearchProps {
  onSearch: (term: string, location: string, limit: number | null) => void;
  isSearching: boolean;
  disabled?: boolean;
}

const LIMIT_OPTIONS = [
  { label: "Sem limite", value: "0" },
  { label: "Até 20", value: "20" },
  { label: "Até 40", value: "40" },
  { label: "Até 60", value: "60" },
  { label: "Até 100", value: "100" },
  { label: "Até 200", value: "200" },
];

export function LeadSearch({ onSearch, isSearching, disabled = false }: LeadSearchProps) {
  const [term, setTerm] = useState("");
  const [location, setLocation] = useState("");
  const [limitValue, setLimitValue] = useState("0");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (term && location) {
      const limit = parseInt(limitValue) || null;
      onSearch(term, location, limit);
    }
  };

  return (
    <Card className="p-6 border-none shadow-sm rounded-xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Filtros de busca</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1.3fr_1.3fr_1fr] items-end">
          {/* Termo */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">O que você procura</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ex: Restaurantes, Oficinas, Dentistas..."
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="pl-9 h-11 bg-muted/40 border-border focus-visible:bg-background"
                required
              />
            </div>
          </div>

          {/* Localização */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Localização</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ex: São Paulo, Rio de Janeiro..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="pl-9 h-11 bg-muted/40 border-border focus-visible:bg-background"
                required
              />
            </div>
          </div>

          {/* Limite */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Quantidade</label>
            <Select value={limitValue} onValueChange={setLimitValue}>
              <SelectTrigger className="h-11 bg-muted/40 border-border">
                <SelectValue placeholder="Limite" />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isSearching || !term || !location || disabled}
            className="h-11 px-8 font-semibold gap-2"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Buscar Leads
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
