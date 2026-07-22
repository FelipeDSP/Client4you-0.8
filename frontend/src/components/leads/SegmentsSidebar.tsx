import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Database, FolderPlus, MoreVertical, Pencil, Trash2, TagsIcon } from "lucide-react";
import { useState } from "react";
import { TagPill } from "./TagPill";
import type { Segment, Tag } from "@/hooks/useSegmentsAndTags";

interface SegmentsSidebarProps {
  segments: Segment[];
  tags: Tag[];
  leadsTotal: number;
  activeSegmentId: string | null;
  onSelect: (id: string | null) => void;
  onNewSegment: () => void;
  onEditSegment: (seg: Segment) => void;
  onDeleteSegment: (id: string) => void;
  onManageTags: () => void;
}

export function SegmentsSidebar({
  segments,
  tags,
  leadsTotal,
  activeSegmentId,
  onSelect,
  onNewSegment,
  onEditSegment,
  onDeleteSegment,
  onManageTags,
}: SegmentsSidebarProps) {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const [pendingDelete, setPendingDelete] = useState<Segment | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Segmentos</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onManageTags} title="Gerenciar etiquetas">
            <TagsIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewSegment} title="Novo segmento">
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="space-y-1">
        {/* Todos os leads */}
        <button
          onClick={() => onSelect(null)}
          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
            activeSegmentId === null ? "bg-orange-50 text-orange-700 font-medium" : "hover:bg-slate-100 text-slate-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4 shrink-0" />
            Todos os leads
          </span>
          <span className="text-xs text-muted-foreground">{leadsTotal}</span>
        </button>

        {segments.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Nenhum segmento. Crie um com o botão <FolderPlus className="inline h-3 w-3" /> acima.
          </p>
        )}

        {segments.map((seg) => {
          const active = activeSegmentId === seg.id;
          return (
            <div
              key={seg.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
                active ? "bg-orange-50" : "hover:bg-slate-100"
              }`}
            >
              <button onClick={() => onSelect(seg.id)} className="flex-1 min-w-0 flex flex-col items-start text-left">
                <span className="flex items-center gap-2 w-full">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color || "#94a3b8" }}
                  />
                  <span className={`truncate text-sm ${active ? "text-orange-700 font-medium" : "text-slate-700"}`}>
                    {seg.name}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">{seg.leadCount}</span>
                </span>
                {seg.tagIds.length > 0 && (
                  <span className="flex flex-wrap gap-1 mt-1 pl-[18px]">
                    {seg.tagIds.map((tid) => {
                      const t = tagById.get(tid);
                      return t ? <TagPill key={tid} name={t.name} color={t.color} /> : null;
                    })}
                  </span>
                )}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-slate-400"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditSegment(seg)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => setPendingDelete(seg)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </nav>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o segmento "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove a pasta e desfaz os vínculos dos leads com ela. Os leads em si <strong>não</strong> são
              apagados — continuam na Base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (pendingDelete) onDeleteSegment(pendingDelete.id);
                if (activeSegmentId === pendingDelete?.id) onSelect(null);
                setPendingDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
