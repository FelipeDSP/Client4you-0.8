import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Loader2 } from "lucide-react";
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
    <Card className="p-6 bg-white shadow-sm border-none">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:flex-row">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ex: Restaurantes, Oficinas, Dentistas..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="pl-9 bg-gray-50 border-gray-200"
            required
          />
        </div>

        <div className="flex-1 relative">
          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ex: São Paulo, Rio de Janeiro..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="pl-9 bg-gray-50 border-gray-200"
            required
          />
        </div>

        <Select value={limitValue} onValueChange={setLimitValue}>
          <SelectTrigger className="md:w-36 bg-gray-50 border-gray-200">
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

        <Button
          type="submit"
          disabled={isSearching || !term || !location || disabled}
          className="md:w-32 font-medium"
        >
          {isSearching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Buscando
            </>
          ) : (
            "Buscar"
          )}
        </Button>
      </form>
    </Card>
  );
}
