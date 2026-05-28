import { Database, Globe, Search, MapPin, Sparkles } from "lucide-react";

interface EnrichmentSourceBadgeProps {
  source: string | null | undefined;
  cached?: boolean | null;
  className?: string;
}

/**
 * Badge compacto que indica DE ONDE veio o email enriquecido.
 *
 * Sources possíveis (correspondem ao backend EmailResult.source):
 * - `cache_hit`     → economizou Firecrawl (entry recente do domain_email_cache)
 * - `dataforseo_contact_url` → scrape direto da URL de contato do GMB ($0)
 * - `firecrawl_search` → 1 call /v1/search (mais barato)
 * - `firecrawl_map_scrape` → /v1/map + /v1/scrape (último recurso)
 */
export function EnrichmentSourceBadge({
  source,
  cached,
  className = "",
}: EnrichmentSourceBadgeProps) {
  if (!source) return null;

  const config = cached
    ? { icon: Database, label: "Cache", color: "text-emerald-700 bg-emerald-50 border-emerald-200" }
    : sourceConfig(source);

  const Icon = config.icon;
  return (
    <span
      title={cached ? `Cache hit: ${source}` : source}
      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium ${config.color} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function sourceConfig(source: string) {
  switch (source) {
    case "dataforseo_contact_url":
      return { icon: MapPin, label: "GMB", color: "text-orange-700 bg-orange-50 border-orange-200" };
    case "firecrawl_search":
      return { icon: Search, label: "Search", color: "text-blue-700 bg-blue-50 border-blue-200" };
    case "firecrawl_map_scrape":
      return { icon: Globe, label: "Scrape", color: "text-violet-700 bg-violet-50 border-violet-200" };
    case "cache_hit":
      return { icon: Database, label: "Cache", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    default:
      return { icon: Sparkles, label: source, color: "text-slate-700 bg-slate-50 border-slate-200" };
  }
}
