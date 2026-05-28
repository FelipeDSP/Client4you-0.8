import { Loader2, RefreshCw, Sparkles, Zap, AlertCircle } from "lucide-react";
import type { EnrichmentProgress as EnrichmentProgressType } from "@/hooks/useLeads";

interface EnrichmentProgressProps {
  progress: EnrichmentProgressType;
}

/**
 * Barra de progresso do batch async de enrichment (PR 6).
 *
 * Renderizado quando `useLeads.enrichmentProgress` !== null. Mostra contadores
 * por status do batch (pending/processing/completed/failed) com cor distintiva
 * pra reenriquecimento (force=true → roxo/Sparkles em vez de azul/Zap).
 */
export function EnrichmentProgress({ progress }: EnrichmentProgressProps) {
  const { total, completed, failed, processing, pending, done, force } = progress;
  const pct = total === 0 ? 0 : Math.round(((completed + failed) / total) * 100);

  const Icon = force ? Sparkles : Zap;
  const accent = force ? "text-purple-600" : "text-blue-600";
  const bg = force ? "bg-purple-50 border-purple-200" : "bg-blue-50 border-blue-200";
  const fillBg = force ? "bg-purple-500" : "bg-blue-500";

  return (
    <div className={`rounded-lg border p-4 ${bg} animate-in fade-in slide-in-from-top-2 duration-300`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-2 ${accent} font-medium text-sm`}>
          {done ? (
            <Icon className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          <span>
            {force ? "Reenriquecendo" : "Enriquecendo"} {completed + failed}/{total}
            {done && " — concluído"}
          </span>
        </div>
        <span className={`text-xs font-mono ${accent}`}>{pct}%</span>
      </div>

      {/* Barra */}
      <div className="h-2 bg-white rounded-full overflow-hidden border border-slate-200">
        <div
          className={`h-full ${fillBg} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Detalhes opcionais (failed visível) */}
      {(failed > 0 || processing > 0) && (
        <div className="flex gap-4 mt-2 text-xs text-slate-600">
          {processing > 0 && (
            <span className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {processing} em processamento
            </span>
          )}
          {pending > 0 && (
            <span>{pending} na fila</span>
          )}
          {failed > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertCircle className="h-3 w-3" />
              {failed} falharam
            </span>
          )}
        </div>
      )}
    </div>
  );
}
