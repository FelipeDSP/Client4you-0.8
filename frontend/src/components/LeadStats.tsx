import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Building2, Mail, Globe, Star, Tags } from "lucide-react";
import { Lead } from "@/types";

interface LeadStatsProps {
  leads: Lead[];
}

/**
 * Painel "Dados dos resultados" — métricas derivadas dos leads da busca atual.
 * Só mostra o que REALMENTE temos nos dados (nada de WhatsApp/horário, que as
 * fontes não fornecem hoje).
 */
export function LeadStats({ leads }: LeadStatsProps) {
  const stats = useMemo(() => {
    const total = leads.length;
    const withEmail = leads.filter((l) => l.email).length;
    const withSite = leads.filter((l) => l.website).length;
    const rated = leads.filter((l) => l.rating > 0);
    const avg = rated.length
      ? rated.reduce((s, l) => s + l.rating, 0) / rated.length
      : 0;

    const counts = new Map<string, number>();
    for (const l of leads) {
      const c = (l.category || "").trim();
      if (c) counts.set(c, (counts.get(c) || 0) + 1);
    }
    const topCats = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c]) => c);

    return { total, withEmail, withSite, avg, ratedCount: rated.length, topCats };
  }, [leads]);

  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);

  const rows = [
    {
      icon: Building2,
      tint: "bg-primary/10 text-primary",
      label: "Negócios encontrados",
      value: String(stats.total),
      sub: "Total na busca",
    },
    {
      icon: Mail,
      tint: "bg-blue-50 text-blue-600",
      label: "Com e-mail",
      value: String(stats.withEmail),
      sub: `${pct(stats.withEmail)}% do total`,
    },
    {
      icon: Globe,
      tint: "bg-green-50 text-green-600",
      label: "Com site",
      value: String(stats.withSite),
      sub: `${pct(stats.withSite)}% do total`,
    },
    {
      icon: Star,
      tint: "bg-yellow-50 text-yellow-600",
      label: "Avaliação média",
      value: stats.avg ? stats.avg.toFixed(1).replace(".", ",") : "—",
      sub: stats.ratedCount
        ? `Baseado em ${stats.ratedCount} avaliad${stats.ratedCount === 1 ? "o" : "os"}`
        : "Sem avaliações",
    },
  ];

  return (
    <Card className="p-5 border-none shadow-sm rounded-xl">
      <h3 className="text-base font-semibold text-foreground mb-1">Dados dos resultados</h3>

      <div className="divide-y divide-border/70">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3.5 py-3.5">
            <div className={`h-11 w-11 shrink-0 rounded-xl grid place-items-center ${r.tint}`}>
              <r.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{r.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold tracking-tight tabular-nums">
                  {r.value}
                </span>
                <span className="text-xs text-muted-foreground truncate">{r.sub}</span>
              </div>
            </div>
          </div>
        ))}

        {stats.topCats.length > 0 && (
          <div className="flex items-start gap-3.5 py-3.5">
            <div className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-purple-50 text-purple-600">
              <Tags className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground mb-1.5">Categorias mais comuns</div>
              <div className="flex flex-wrap gap-1.5">
                {stats.topCats.map((c) => (
                  <span
                    key={c}
                    className="text-xs font-medium bg-muted text-foreground/80 rounded-full px-2.5 py-0.5 capitalize"
                  >
                    {c.toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
