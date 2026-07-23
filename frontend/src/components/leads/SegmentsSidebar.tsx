import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import {
  Database,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  ListPlus,
  MoreVertical,
  Pencil,
  Trash2,
  TagsIcon,
  ChevronRight,
  ChevronDown,
  FolderInput,
  CornerDownRight,
} from "lucide-react";
import { useState } from "react";
import { TagPill } from "./TagPill";
import type { Segment, Folder, Tag } from "@/hooks/useSegmentsAndTags";

interface SegmentsSidebarProps {
  segments: Segment[];
  folders: Folder[];
  tags: Tag[];
  leadsTotal: number;
  activeSegmentId: string | null;
  activeFolderId: string | null;
  onSelectSegment: (id: string | null) => void;
  onSelectFolder: (id: string | null) => void;
  onNewSegment: () => void;
  onEditSegment: (seg: Segment) => void;
  onDeleteSegment: (id: string) => void;
  onNewFolder: () => void;
  onEditFolder: (folder: Folder) => void;
  onDeleteFolder: (id: string) => void;
  onMoveSegment: (segmentId: string, folderId: string | null) => void;
  onManageTags: () => void;
}

export function SegmentsSidebar({
  segments,
  folders,
  tags,
  leadsTotal,
  activeSegmentId,
  activeFolderId,
  onSelectSegment,
  onSelectFolder,
  onNewSegment,
  onEditSegment,
  onDeleteSegment,
  onNewFolder,
  onEditFolder,
  onDeleteFolder,
  onMoveSegment,
  onManageTags,
}: SegmentsSidebarProps) {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const [pendingDeleteSeg, setPendingDeleteSeg] = useState<Segment | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<Folder | null>(null);
  // Pastas recolhidas (por padrão todas expandidas). Guarda só as recolhidas.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const rootSegments = segments.filter((s) => !s.folderId);
  const segmentsByFolder = (folderId: string) => segments.filter((s) => s.folderId === folderId);

  // ── Linha de segmento (reutilizada dentro de pasta e na raiz) ──────────────
  const SegmentRow = ({ seg, indented }: { seg: Segment; indented?: boolean }) => {
    const active = activeSegmentId === seg.id;
    return (
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
          indented ? "ml-4" : ""
        } ${active ? "bg-orange-50" : "hover:bg-slate-100"}`}
      >
        <button onClick={() => onSelectSegment(seg.id)} className="flex-1 min-w-0 flex flex-col items-start text-left">
          <span className="flex items-center gap-2 w-full">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color || "#94a3b8" }} />
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
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-slate-400">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEditSegment(seg)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="mr-2 h-4 w-4" />
                Mover para pasta
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                <DropdownMenuItem
                  disabled={!seg.folderId}
                  onClick={() => onMoveSegment(seg.id, null)}
                >
                  <CornerDownRight className="mr-2 h-4 w-4" />
                  Raiz (sem pasta)
                </DropdownMenuItem>
                {folders.length > 0 && <DropdownMenuSeparator />}
                {folders.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    disabled={seg.folderId === f.id}
                    onClick={() => onMoveSegment(seg.id, f.id)}
                  >
                    <span className="h-2.5 w-2.5 rounded-full mr-2" style={{ backgroundColor: f.color || "#94a3b8" }} />
                    {f.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setPendingDeleteSeg(seg)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organização</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onManageTags} title="Gerenciar etiquetas">
            <TagsIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewFolder} title="Nova pasta">
            <FolderPlus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewSegment} title="Novo segmento">
            <ListPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="space-y-1">
        {/* Todos os leads */}
        <button
          onClick={() => onSelectSegment(null)}
          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
            activeSegmentId === null && activeFolderId === null
              ? "bg-orange-50 text-orange-700 font-medium"
              : "hover:bg-slate-100 text-slate-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4 shrink-0" />
            Todos os leads
          </span>
          <span className="text-xs text-muted-foreground">{leadsTotal}</span>
        </button>

        {folders.length === 0 && segments.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Crie uma <FolderPlus className="inline h-3 w-3" /> pasta ou um <ListPlus className="inline h-3 w-3" />{" "}
            segmento pra organizar seus leads.
          </p>
        )}

        {/* Pastas com seus segmentos */}
        {folders.map((folder) => {
          const isCollapsed = collapsed.has(folder.id);
          const folderSegs = segmentsByFolder(folder.id);
          const folderActive = activeFolderId === folder.id;
          return (
            <div key={folder.id} className="space-y-0.5">
              <div
                className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
                  folderActive ? "bg-orange-50" : "hover:bg-slate-100"
                }`}
              >
                <button
                  onClick={() => toggleCollapsed(folder.id)}
                  className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0"
                  title={isCollapsed ? "Expandir" : "Recolher"}
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                <button
                  onClick={() => onSelectFolder(folder.id)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                  title={`Ver todos os leads dos segmentos de "${folder.name}"`}
                >
                  {folderActive ? (
                    <FolderOpen className="h-4 w-4 shrink-0" style={{ color: folder.color || "#f59e0b" }} />
                  ) : (
                    <FolderIcon className="h-4 w-4 shrink-0" style={{ color: folder.color || "#94a3b8" }} />
                  )}
                  <span className={`truncate text-sm ${folderActive ? "text-orange-700 font-medium" : "text-slate-700"}`}>
                    {folder.name}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">{folderSegs.length}</span>
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
                    <DropdownMenuItem onClick={() => onEditFolder(folder)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar pasta
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onNewSegment}>
                      <ListPlus className="mr-2 h-4 w-4" />
                      Novo segmento
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onClick={() => setPendingDeleteFolder(folder)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir pasta
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {!isCollapsed && (
                <div className="space-y-0.5">
                  {folderSegs.length === 0 ? (
                    <p className="ml-6 px-2 py-1 text-xs text-muted-foreground/70 italic">Pasta vazia</p>
                  ) : (
                    folderSegs.map((seg) => <SegmentRow key={seg.id} seg={seg} indented />)
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Segmentos soltos (sem pasta) */}
        {rootSegments.length > 0 && (
          <div className="space-y-0.5 pt-1">
            {folders.length > 0 && (
              <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                Sem pasta
              </p>
            )}
            {rootSegments.map((seg) => (
              <SegmentRow key={seg.id} seg={seg} />
            ))}
          </div>
        )}
      </nav>

      {/* Confirmação: excluir segmento */}
      <AlertDialog open={!!pendingDeleteSeg} onOpenChange={(o) => !o && setPendingDeleteSeg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o segmento "{pendingDeleteSeg?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove o segmento e desfaz os vínculos dos leads com ele. Os leads em si <strong>não</strong> são
              apagados — continuam na Base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (pendingDeleteSeg) {
                  onDeleteSegment(pendingDeleteSeg.id);
                  if (activeSegmentId === pendingDeleteSeg.id) onSelectSegment(null);
                }
                setPendingDeleteSeg(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação: excluir pasta */}
      <AlertDialog open={!!pendingDeleteFolder} onOpenChange={(o) => !o && setPendingDeleteFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a pasta "{pendingDeleteFolder?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A pasta some, mas os segmentos dentro dela <strong>não</strong> são apagados — voltam pra "Sem pasta".
              Os leads também continuam intactos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (pendingDeleteFolder) {
                  onDeleteFolder(pendingDeleteFolder.id);
                  if (activeFolderId === pendingDeleteFolder.id) onSelectFolder(null);
                }
                setPendingDeleteFolder(null);
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
