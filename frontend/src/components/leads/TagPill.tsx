import { X } from "lucide-react";

// Paleta padrão pra novas etiquetas/segmentos (Tailwind-500 aproximados).
export const TAG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#22c55e", // green
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
  "#64748b", // slate
];

// Texto legível (claro/escuro) conforme a luminância da cor de fundo.
export function readableText(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return "#111827";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111827" : "#ffffff";
}

export function TagPill({
  name,
  color,
  onRemove,
  onClick,
  active,
  className = "",
}: {
  name: string;
  color: string;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const bg = color || "#64748b";
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-none transition-shadow ${
        onClick ? "cursor-pointer hover:opacity-90" : ""
      } ${active ? "ring-2 ring-offset-1 ring-slate-500" : ""} ${className}`}
      style={{ backgroundColor: bg, color: readableText(bg) }}
      title={name}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-60"
          aria-label={`Remover ${name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
