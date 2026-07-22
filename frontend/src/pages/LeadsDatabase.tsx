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
  Tags as TagsIcon,
  ChevronDown,
  X,
} from "lucide-react";
import { LeadFilters, defaultFilters, filterLeads, LeadFilterState } from "@/components/LeadFilters";
import { LeadTable } from "@/components/LeadTable";
import { ExportButton } from "@/components/ExportButton";
import { Card, CardContent } from "@/components/ui/card";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLeads } from "@/hooks/useLeads";
import { useSegmentsAndTags, type Segment } from "@/hooks/useSegmentsAndTags";
import { SegmentsSidebar } from "@/components/leads/SegmentsSidebar";
import { SegmentDialog } from "@/components/leads/SegmentDialog";
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
    tags,
    leadSegments,
    leadTags,
    createSegment,
    updateSegment,
    deleteSegment,
    createTag,
    updateTag,
    deleteTag,
    addLeadsToSegment,
    removeLeadsFromSegment,
    addTagToLeads,
    removeTagFromLeads,
    setSegmentTag,
  } = useSegmentsAndTags();
  const { toast } = useToast();

  const [filters, setFilters] = useState<LeadFilterState>(defaultFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Organização
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showSegmentDialog, setShowSegmentDialog] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [showTagsDialog, setShowTagsDialog] = useState(false);

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

  // Filter combinado: segmento + etiquetas + search + filters
  const filtered = useMemo(() => {
    let result = leads;

    if (activeSegmentId) {
      result = result.filter((l) => (leadSegments[l.id] || []).includes(activeSegmentId));
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
  }, [leads, activeSegmentId, selectedTagIds, leadSegments, leadTags, search, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LEADS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * LEADS_PER_PAGE, safePage * LEADS_PER_PAGE);

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
  }, [filters, search, activeSegmentId, selectedTagIds]);

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

  const handleSaveSegment = async (data: { name: string; color: string; description: string; tagIds: string[] }) => {
    let segId = editingSegment?.id;
    const before = new Set(editingSegment?.tagIds || []);
    try {
      if (editingSegment) {
        await updateSegment({ id: editingSegment.id, name: data.name, color: data.color, description: data.description });
      } else {
        const created: any = await createSegment({ name: data.name, color: data.color, description: data.description });
        segId = created?.id;
      }
      // reconcilia etiquetas do segmento
      const after = new Set(data.tagIds);
      const ops: Promise<any>[] = [];
      if (segId) {
        for (const t of data.tagIds) if (!before.has(t)) ops.push(setSegmentTag({ segmentId: segId, tagId: t, on: true }));
        for (const t of before) if (!after.has(t)) ops.push(setSegmentTag({ segmentId: segId, tagId: t, on: false }));
      }
      await Promise.all(ops);
      toast({ title: editingSegment ? "Segmento atualizado" : "Segmento criado" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro no segmento", description: (e as Error).message });
      throw e;
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

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Base de Leads</h2>
          <p className="text-muted-foreground mt-1">
            Organize seus leads em segmentos (pastas) e etiquetas. Um lead pode estar em vários segmentos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar lead
          </Button>

          {leads.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-red-600 hover:text-red-700 border-red-200">
                  <Trash2 className="h-4 w-4" />
                  Limpar base
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apagar TODOS os leads?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é permanente. Vai apagar {leads.length} leads e não pode ser desfeita. Considere exportar
                    antes.
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
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total" value={stats.total} color="blue" />
        <StatCard icon={Mail} label="Com email" value={stats.withEmail} color="emerald" />
        <StatCard icon={Phone} label="Com WhatsApp" value={stats.withWhatsApp} color="green" />
        <StatCard icon={Globe} label="Com site" value={stats.withWebsite} color="purple" />
      </div>

      {/* Layout: sidebar de segmentos + conteúdo */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <aside className="lg:w-60 lg:shrink-0">
          <Card>
            <CardContent className="p-3">
              <SegmentsSidebar
                segments={segments}
                tags={tags}
                leadsTotal={leads.length}
                activeSegmentId={activeSegmentId}
                onSelect={setActiveSegmentId}
                onNewSegment={() => {
                  setEditingSegment(null);
                  setShowSegmentDialog(true);
                }}
                onEditSegment={(seg) => {
                  setEditingSegment(seg);
                  setShowSegmentDialog(true);
                }}
                onDeleteSegment={(id) => deleteSegment(id)}
                onManageTags={() => setShowTagsDialog(true)}
              />
            </CardContent>
          </Card>
        </aside>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Search + tag filter + actions */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div className="relative max-w-md flex-1">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, email, telefone, categoria..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <ExportButton leads={filtered} selectedLeads={selected} />
              </div>

              {/* Filtro por etiquetas */}
              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Etiquetas:</span>
                  {tags.map((t) => (
                    <TagPill
                      key={t.id}
                      name={t.name}
                      color={t.color}
                      active={selectedTagIds.includes(t.id)}
                      onClick={() => toggleTagFilter(t.id)}
                    />
                  ))}
                  {selectedTagIds.length > 0 && (
                    <button
                      onClick={() => setSelectedTagIds([])}
                      className="text-xs text-muted-foreground hover:text-slate-700 flex items-center gap-0.5"
                    >
                      <X className="h-3 w-3" /> limpar
                    </button>
                  )}
                </div>
              )}

              <LeadFilters leads={leads} filters={filters} onFiltersChange={setFilters} />
            </CardContent>
          </Card>

          {/* Barra de ações em massa */}
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-orange-50/50 px-4 py-2">
              <span className="text-sm font-medium text-slate-700">{selected.length} selecionado(s)</span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <FolderInput className="h-4 w-4" />
                    Adicionar a segmento
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  <DropdownMenuLabel>Segmentos</DropdownMenuLabel>
                  {segments.length === 0 && (
                    <DropdownMenuItem disabled>Nenhum segmento ainda</DropdownMenuItem>
                  )}
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
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <TagsIcon className="h-4 w-4" />
                    Aplicar etiqueta
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
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
                  className="gap-1.5 text-red-600 border-red-200 hover:text-red-700"
                  onClick={handleRemoveFromSegment}
                >
                  <X className="h-4 w-4" />
                  Remover de "{activeSegment.name}"
                </Button>
              )}
            </div>
          )}

          {/* Resultados */}
          <Card>
            <CardContent className="p-0">
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
                <>
                  <div className="px-4 py-3 border-b bg-slate-50/50 text-sm text-muted-foreground flex justify-between items-center">
                    <span>
                      Mostrando {paginated.length} de {filtered.length}
                      {filtered.length < leads.length && (
                        <span className="ml-2 text-xs">(filtrado de {leads.length} total)</span>
                      )}
                    </span>
                    <span className="text-xs">
                      Página {safePage} de {totalPages}
                    </span>
                  </div>
                  <LeadTable
                    leads={paginated}
                    selectedLeads={selected}
                    onSelectionChange={setSelected}
                    onDelete={handleDelete}
                    renderTags={renderLeadTags}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* Paginação */}
          {filtered.length > LEADS_PER_PAGE && (
            <div className="flex justify-center items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-sm px-3">
                {safePage} / {totalPages}
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

      {/* Dialogs de segmento e etiquetas */}
      <SegmentDialog
        open={showSegmentDialog}
        onOpenChange={setShowSegmentDialog}
        editing={editingSegment}
        tags={tags}
        onSave={handleSaveSegment}
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
    </div>
  );
}

// ─── Sub-component: card de estatística ──────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "blue" | "emerald" | "green" | "purple";
}) {
  const colorMap = {
    blue: "text-blue-600 bg-blue-50",
    emerald: "text-emerald-600 bg-emerald-50",
    green: "text-green-600 bg-green-50",
    purple: "text-purple-600 bg-purple-50",
  } as const;
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</span>
          <div className={`p-1.5 rounded ${colorMap[color]}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900">{value.toLocaleString("pt-BR")}</div>
      </CardContent>
    </Card>
  );
}
