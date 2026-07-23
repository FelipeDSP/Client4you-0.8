import { useState, useEffect, useMemo } from "react";
import {
  Database,
  Users,
  Mail,
  Phone,
  Globe,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Loader2,
  Plus,
  FolderInput,
  Folder as FolderIcon,
  Tags as TagsIcon,
  ChevronDown,
  MoreHorizontal,
  Check,
  X,
} from "lucide-react";
import { LeadFilters, defaultFilters, filterLeads, LeadFilterState } from "@/components/LeadFilters";
import { LeadTable } from "@/components/LeadTable";
import { ExportButton } from "@/components/ExportButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLeads } from "@/hooks/useLeads";
import { useSegmentsAndTags, type Segment, type Folder } from "@/hooks/useSegmentsAndTags";
import { SegmentsSidebar } from "@/components/leads/SegmentsSidebar";
import { SegmentDialog } from "@/components/leads/SegmentDialog";
import { FolderDialog } from "@/components/leads/FolderDialog";
import { ManageTagsDialog } from "@/components/leads/ManageTagsDialog";
import { TagPill } from "@/components/leads/TagPill";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { useToast } from "@/hooks/use-toast";

const LEADS_PER_PAGE = 25;

/**
 * Base de Leads — visualiza TODOS os leads salvos, organizados em segmentos
 * (pastas) e etiquetas. A busca transitória fica em /search.
 */
export default function LeadsDatabase() {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle("Base de Leads", Database);
  }, [setPageTitle]);

  const { leads, isLoading, deleteLead, clearAllLeads, addManualLead, isAddingManualLead } = useLeads();
  const {
    segments,
    folders,
    tags,
    leadSegments,
    leadTags,
    createSegment,
    updateSegment,
    deleteSegment,
    createFolder,
    updateFolder,
    deleteFolder,
    moveSegmentToFolder,
    createTag,
    updateTag,
    deleteTag,
    addLeadsToSegment,
    removeLeadsFromSegment,
    addTagToLeads,
    removeTagFromLeads,
  } = useSegmentsAndTags();
  const { toast } = useToast();

  const [filters, setFilters] = useState<LeadFilterState>(defaultFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);

  // Organização
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showSegmentDialog, setShowSegmentDialog] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [showTagsDialog, setShowTagsDialog] = useState(false);

  // Seleção segmento e pasta são mutuamente exclusivas.
  const selectSegment = (id: string | null) => {
    setActiveSegmentId(id);
    setActiveFolderId(null);
  };
  const selectFolder = (id: string | null) => {
    setActiveFolderId(id);
    setActiveSegmentId(null);
  };

  const [newLead, setNewLead] = useState({
    name: "",
    email: "",
    phone: "",
    category: "",
    address: "",
    website: "",
    hasWhatsApp: false,
  });

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const resetNewLead = () =>
    setNewLead({ name: "", email: "", phone: "", category: "", address: "", website: "", hasWhatsApp: false });

  const handleAddLead = async () => {
    if (!newLead.name.trim()) {
      toast({ variant: "destructive", title: "Nome obrigatório", description: "Informe pelo menos o nome do lead." });
      return;
    }
    try {
      await addManualLead(newLead);
      toast({ title: "Lead adicionado", description: `${newLead.name} entrou na sua base.` });
      setShowAddDialog(false);
      resetNewLead();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao adicionar", description: (e as Error).message || "Tente de novo." });
    }
  };

  // ids dos segmentos dentro da pasta ativa (pra filtrar por pasta = união deles)
  const activeFolderSegmentIds = useMemo(
    () => (activeFolderId ? segments.filter((s) => s.folderId === activeFolderId).map((s) => s.id) : []),
    [activeFolderId, segments],
  );

  // Filter combinado: segmento/pasta + etiquetas + search + filters
  const filtered = useMemo(() => {
    let result = leads;

    if (activeSegmentId) {
      result = result.filter((l) => (leadSegments[l.id] || []).includes(activeSegmentId));
    } else if (activeFolderId) {
      // pasta: lead que está em QUALQUER segmento da pasta
      const segSet = new Set(activeFolderSegmentIds);
      result = result.filter((l) => (leadSegments[l.id] || []).some((sid) => segSet.has(sid)));
    }
    if (selectedTagIds.length > 0) {
      result = result.filter((l) => {
        const lt = leadTags[l.id] || [];
        return selectedTagIds.some((t) => lt.includes(t)); // tem ao menos uma
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((l) =>
        [l.name, l.email, l.phone, l.category, l.address]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q)),
      );
    }
    return filterLeads(result, filters);
  }, [leads, activeSegmentId, activeFolderId, activeFolderSegmentIds, selectedTagIds, leadSegments, leadTags, search, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LEADS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * LEADS_PER_PAGE, safePage * LEADS_PER_PAGE);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * LEADS_PER_PAGE + 1;
  const rangeEnd = (safePage - 1) * LEADS_PER_PAGE + paginated.length;

  const stats = useMemo(
    () => ({
      total: leads.length,
      withEmail: leads.filter((l) => l.email).length,
      withWhatsApp: leads.filter((l) => l.hasWhatsApp).length,
      withWebsite: leads.filter((l) => l.website).length,
    }),
    [leads],
  );

  useEffect(() => {
    setPage(1);
  }, [filters, search, activeSegmentId, activeFolderId, selectedTagIds]);

  const handleDelete = async (id: string) => {
    await deleteLead(id);
    setSelected((prev) => prev.filter((s) => s !== id));
  };

  const handleClearAll = async () => {
    await clearAllLeads();
    setSelected([]);
  };

  // ── Organização: handlers ────────────────────────────────────────────────
  const toggleTagFilter = (id: string) =>
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const handleSaveSegment = async (data: { name: string; color: string; description: string }) => {
    try {
      if (editingSegment) {
        await updateSegment({ id: editingSegment.id, name: data.name, color: data.color, description: data.description });
      } else {
        await createSegment({ name: data.name, color: data.color, description: data.description });
      }
      toast({ title: editingSegment ? "Segmento atualizado" : "Segmento criado" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro no segmento", description: (e as Error).message });
      throw e;
    }
  };

  const handleSaveFolder = async (data: { name: string; color: string }) => {
    try {
      if (editingFolder) {
        await updateFolder({ id: editingFolder.id, name: data.name, color: data.color });
        toast({ title: "Pasta atualizada" });
      } else {
        await createFolder({ name: data.name, color: data.color });
        toast({ title: "Pasta criada" });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro na pasta", description: (e as Error).message });
      throw e;
    }
  };

  const handleMoveSegment = async (segmentId: string, folderId: string | null) => {
    try {
      await moveSegmentToFolder({ segmentId, folderId });
      const seg = segments.find((s) => s.id === segmentId);
      const dest = folderId ? folders.find((f) => f.id === folderId)?.name : "Sem pasta";
      toast({ title: "Segmento movido", description: `"${seg?.name}" → ${dest}.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao mover", description: (e as Error).message });
    }
  };

  const handleAddToSegment = async (segmentId: string) => {
    if (selected.length === 0) return;
    try {
      await addLeadsToSegment({ segmentId, leadIds: selected });
      const seg = segments.find((s) => s.id === segmentId);
      toast({ title: "Adicionado ao segmento", description: `${selected.length} lead(s) em "${seg?.name}".` });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: (e as Error).message });
    }
  };

  const handleRemoveFromSegment = async () => {
    if (!activeSegmentId || selected.length === 0) return;
    try {
      await removeLeadsFromSegment({ segmentId: activeSegmentId, leadIds: selected });
      toast({ title: "Removido do segmento", description: `${selected.length} lead(s) fora da pasta.` });
      setSelected([]);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: (e as Error).message });
    }
  };

  const handleApplyTag = async (tagId: string) => {
    if (selected.length === 0) return;
    try {
      await addTagToLeads({ tagId, leadIds: selected });
      const t = tagById.get(tagId);
      toast({ title: "Etiqueta aplicada", description: `"${t?.name}" em ${selected.length} lead(s).` });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: (e as Error).message });
    }
  };

  const handleRemoveTagFromLead = async (tagId: string, leadId: string) => {
    try {
      await removeTagFromLeads({ tagId, leadIds: [leadId] });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: (e as Error).message });
    }
  };

  // Chips de etiqueta por lead (na tabela)
  const renderLeadTags = (leadId: string) => {
    const ids = leadTags[leadId] || [];
    if (ids.length === 0) return null;
    return ids.map((tid) => {
      const t = tagById.get(tid);
      return t ? (
        <TagPill key={tid} name={t.name} color={t.color} onRemove={() => handleRemoveTagFromLead(tid, leadId)} />
      ) : null;
    });
  };

  const activeSegment = segments.find((s) => s.id === activeSegmentId) || null;
  const activeFolder = folders.find((f) => f.id === activeFolderId) || null;

  return (
    <div className="space-y-5 animate-fade-in pb-10">
      {/* Header + estatísticas compactas */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Base de Leads</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
              <Users className="h-4 w-4 text-slate-400" />
              {stats.total.toLocaleString("pt-BR")} leads
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Mail className="h-4 w-4 text-emerald-500" />
              {stats.withEmail.toLocaleString("pt-BR")} com e-mail
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Phone className="h-4 w-4 text-green-500" />
              {stats.withWhatsApp.toLocaleString("pt-BR")} WhatsApp
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Globe className="h-4 w-4 text-blue-500" />
              {stats.withWebsite.toLocaleString("pt-BR")} com site
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar lead
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={leads.length === 0}
                className="text-red-600 focus:text-red-600"
                onClick={() => setShowClearConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Limpar base
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Layout: sidebar de segmentos + conteúdo */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Sidebar */}
        <aside className="w-full lg:w-64 lg:shrink-0">
          <div className="rounded-xl border bg-white p-3 lg:sticky lg:top-4">
            <SegmentsSidebar
              segments={segments}
              folders={folders}
              leadsTotal={leads.length}
              activeSegmentId={activeSegmentId}
              activeFolderId={activeFolderId}
              onSelectSegment={selectSegment}
              onSelectFolder={selectFolder}
              onNewSegment={() => {
                setEditingSegment(null);
                setShowSegmentDialog(true);
              }}
              onEditSegment={(seg) => {
                setEditingSegment(seg);
                setShowSegmentDialog(true);
              }}
              onDeleteSegment={(id) => deleteSegment(id)}
              onNewFolder={() => {
                setEditingFolder(null);
                setShowFolderDialog(true);
              }}
              onEditFolder={(folder) => {
                setEditingFolder(folder);
                setShowFolderDialog(true);
              }}
              onDeleteFolder={(id) => deleteFolder(id)}
              onMoveSegment={handleMoveSegment}
              onManageTags={() => setShowTagsDialog(true)}
            />
          </div>
        </aside>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border bg-white overflow-hidden">
            {/* Barra de ferramentas */}
            <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nome, e-mail, telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-2 sm:ml-auto">
                {tags.length > 0 && (
                  <Popover open={showTagFilter} onOpenChange={setShowTagFilter}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`gap-2 ${selectedTagIds.length > 0 ? "border-orange-500 text-orange-600 bg-orange-50" : ""}`}
                      >
                        <TagsIcon className="h-4 w-4" />
                        Etiquetas
                        {selectedTagIds.length > 0 && (
                          <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-200 px-1 text-xs font-semibold text-orange-800">
                            {selectedTagIds.length}
                          </span>
                        )}
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-60 p-2">
                      <div className="flex items-center justify-between px-1 pb-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Filtrar por etiqueta
                        </span>
                        {selectedTagIds.length > 0 && (
                          <button
                            onClick={() => setSelectedTagIds([])}
                            className="text-xs text-muted-foreground hover:text-slate-700"
                          >
                            limpar
                          </button>
                        )}
                      </div>
                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {tags.map((t) => {
                          const on = selectedTagIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              onClick={() => toggleTagFilter(t.id)}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${on ? "bg-orange-50" : "hover:bg-slate-100"}`}
                            >
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                              <span className="truncate">{t.name}</span>
                              {on && <Check className="ml-auto h-4 w-4 text-orange-600" />}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                <LeadFilters leads={leads} filters={filters} onFiltersChange={setFilters} showSearch={false} />
                <ExportButton leads={filtered} selectedLeads={selected} />
              </div>
            </div>

            {/* Chips de contexto (pasta / segmento / etiquetas ativos) */}
            {(activeFolder || activeSegment || selectedTagIds.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50/60 px-3 py-2">
                {activeFolder && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                    <FolderIcon className="h-3 w-3" style={{ color: activeFolder.color || "#94a3b8" }} />
                    {activeFolder.name}
                    <button onClick={() => selectSegment(null)} className="hover:text-slate-900" aria-label="Limpar pasta">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {activeSegment && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeSegment.color || "#94a3b8" }} />
                    {activeSegment.name}
                    <button onClick={() => selectSegment(null)} className="hover:text-slate-900" aria-label="Limpar segmento">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {selectedTagIds.map((tid) => {
                  const t = tagById.get(tid);
                  return t ? (
                    <TagPill key={tid} name={t.name} color={t.color} onRemove={() => toggleTagFilter(tid)} />
                  ) : null;
                })}
              </div>
            )}

            {/* Barra de seleção em massa */}
            {selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b bg-orange-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{selected.length} selecionado(s)</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 bg-white">
                        <FolderInput className="h-4 w-4" />
                        Adicionar a segmento
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                      <DropdownMenuLabel>Segmentos</DropdownMenuLabel>
                      {segments.length === 0 && <DropdownMenuItem disabled>Nenhum segmento ainda</DropdownMenuItem>}
                      {segments.map((s) => (
                        <DropdownMenuItem key={s.id} onClick={() => handleAddToSegment(s.id)}>
                          <span className="h-2.5 w-2.5 rounded-full mr-2" style={{ backgroundColor: s.color || "#94a3b8" }} />
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingSegment(null);
                          setShowSegmentDialog(true);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Novo segmento
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 bg-white">
                        <TagsIcon className="h-4 w-4" />
                        Aplicar etiqueta
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                      <DropdownMenuLabel>Etiquetas</DropdownMenuLabel>
                      {tags.length === 0 && <DropdownMenuItem disabled>Nenhuma etiqueta ainda</DropdownMenuItem>}
                      {tags.map((t) => (
                        <DropdownMenuItem key={t.id} onClick={() => handleApplyTag(t.id)}>
                          <span className="h-2.5 w-2.5 rounded-full mr-2" style={{ backgroundColor: t.color }} />
                          {t.name}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowTagsDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Gerenciar etiquetas
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {activeSegment && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 bg-white text-red-600 border-red-200 hover:text-red-700"
                      onClick={handleRemoveFromSegment}
                    >
                      <X className="h-4 w-4" />
                      Remover do segmento
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Tabela / estados */}
            {isLoading ? (
              <div className="py-20 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <Database className="h-12 w-12 mx-auto text-muted-foreground/40" />
                {leads.length === 0 ? (
                  <>
                    <h3 className="font-medium">Sua base ainda está vazia</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Vá em <strong>Buscar Leads</strong> pra começar a coletar contatos do Google Maps.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-medium">Nenhum lead corresponde aos filtros</h3>
                    <p className="text-sm text-muted-foreground">
                      Limpe os filtros, o segmento ou as etiquetas pra ver mais leads.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <LeadTable
                leads={paginated}
                selectedLeads={selected}
                onSelectionChange={setSelected}
                onDelete={handleDelete}
                renderTags={renderLeadTags}
              />
            )}

            {/* Rodapé: contagem + paginação */}
            {!isLoading && filtered.length > 0 && (
              <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Mostrando <strong className="text-slate-700">{rangeStart}–{rangeEnd}</strong> de{" "}
                  <strong className="text-slate-700">{filtered.length}</strong> leads
                  {filtered.length < leads.length && <span className="ml-1">(de {leads.length} no total)</span>}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <span className="px-1 text-xs">
                      Página {safePage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialog: adicionar lead manualmente */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetNewLead();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar lead manualmente</DialogTitle>
            <DialogDescription>
              Cadastre um lead que você conseguiu fora do extrator (indicação, evento, networking).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Nome *</Label>
              <Input
                id="lead-name"
                placeholder="João da Silva ou Empresa LTDA"
                value={newLead.name}
                onChange={(e) => setNewLead((s) => ({ ...s, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  placeholder="contato@empresa.com"
                  value={newLead.email}
                  onChange={(e) => setNewLead((s) => ({ ...s, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Telefone</Label>
                <Input
                  id="lead-phone"
                  placeholder="(11) 99999-9999"
                  value={newLead.phone}
                  onChange={(e) => setNewLead((s) => ({ ...s, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-category">Categoria</Label>
              <Input
                id="lead-category"
                placeholder="Restaurante, advocacia, e-commerce..."
                value={newLead.category}
                onChange={(e) => setNewLead((s) => ({ ...s, category: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-website">Site</Label>
              <Input
                id="lead-website"
                placeholder="https://empresa.com"
                value={newLead.website}
                onChange={(e) => setNewLead((s) => ({ ...s, website: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-address">Endereço</Label>
              <Input
                id="lead-address"
                placeholder="Rua X, 123, São Paulo - SP"
                value={newLead.address}
                onChange={(e) => setNewLead((s) => ({ ...s, address: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Tem WhatsApp?</Label>
                <p className="text-xs text-muted-foreground">Marque se você sabe que o telefone tem WhatsApp ativo.</p>
              </div>
              <Switch
                checked={newLead.hasWhatsApp}
                onCheckedChange={(v) => setNewLead((s) => ({ ...s, hasWhatsApp: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={isAddingManualLead}>
              Cancelar
            </Button>
            <Button onClick={handleAddLead} disabled={isAddingManualLead || !newLead.name.trim()}>
              {isAddingManualLead ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Salvar lead
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogs de segmento, pasta e etiquetas */}
      <SegmentDialog
        open={showSegmentDialog}
        onOpenChange={setShowSegmentDialog}
        editing={editingSegment}
        onSave={handleSaveSegment}
      />
      <FolderDialog
        open={showFolderDialog}
        onOpenChange={setShowFolderDialog}
        editing={editingFolder}
        onSave={handleSaveFolder}
      />
      <ManageTagsDialog
        open={showTagsDialog}
        onOpenChange={setShowTagsDialog}
        tags={tags}
        onCreate={async (name, color) => {
          try {
            await createTag({ name, color });
          } catch (e) {
            toast({ variant: "destructive", title: "Erro ao criar etiqueta", description: (e as Error).message });
          }
        }}
        onUpdate={async (id, patch) => {
          try {
            await updateTag({ id, ...patch });
          } catch (e) {
            toast({ variant: "destructive", title: "Erro ao editar etiqueta", description: (e as Error).message });
          }
        }}
        onDelete={async (id) => {
          try {
            await deleteTag(id);
            setSelectedTagIds((prev) => prev.filter((t) => t !== id));
          } catch (e) {
            toast({ variant: "destructive", title: "Erro ao excluir etiqueta", description: (e as Error).message });
          }
        }}
      />

      {/* Confirmação: limpar base inteira */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar TODOS os leads?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. Vai apagar {leads.length} leads e não pode ser desfeita. Considere exportar antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} className="bg-red-600 hover:bg-red-700">
              Apagar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
