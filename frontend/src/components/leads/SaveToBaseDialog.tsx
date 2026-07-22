import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Database, Loader2, Plus } from "lucide-react";
import { TagPill, TAG_COLORS } from "./TagPill";
import { useSegmentsAndTags } from "@/hooks/useSegmentsAndTags";

interface SaveToBaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadCount: number;
  /** Executa o salvamento + vínculos. Recebe os segmentos/etiquetas escolhidos. */
  onConfirm: (selection: { segmentIds: string[]; tagIds: string[] }) => Promise<void>;
}

export function SaveToBaseDialog({ open, onOpenChange, leadCount, onConfirm }: SaveToBaseDialogProps) {
  const { segments, tags, createSegment, createTag } = useSegmentsAndTags();

  const [segmentIds, setSegmentIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [newSegName, setNewSegName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSegmentIds([]);
      setTagIds([]);
      setNewSegName("");
      setNewTagName("");
      setCreating(false);
      setSaving(false);
    }
  }, [open]);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const handleCreateSegment = async () => {
    const name = newSegName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created: any = await createSegment({ name, color: TAG_COLORS[segments.length % TAG_COLORS.length] });
      if (created?.id) setSegmentIds((prev) => [...prev, created.id]);
      setNewSegName("");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created: any = await createTag({ name, color: TAG_COLORS[tags.length % TAG_COLORS.length] });
      if (created?.id) setTagIds((prev) => [...prev, created.id]);
      setNewTagName("");
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm({ segmentIds, tagIds });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar {leadCount} lead(s) na Base</DialogTitle>
          <DialogDescription>
            Opcionalmente, já organize: escolha segmentos (pastas) e etiquetas pra aplicar nesses leads.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Segmentos */}
          <div className="space-y-2">
            <Label>Segmentos (opcional)</Label>
            {segments.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {segments.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(segmentIds, setSegmentIds, s.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      segmentIds.includes(s.id)
                        ? "border-orange-400 bg-orange-50 text-orange-700 font-medium"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color || "#94a3b8" }} />
                    {s.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum segmento ainda. Crie um abaixo.</p>
            )}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Novo segmento..."
                value={newSegName}
                onChange={(e) => setNewSegName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSegment()}
                maxLength={80}
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1 shrink-0"
                onClick={handleCreateSegment}
                disabled={creating || !newSegName.trim()}
              >
                <Plus className="h-4 w-4" />
                Criar
              </Button>
            </div>
          </div>

          {/* Etiquetas */}
          <div className="space-y-2">
            <Label>Etiquetas (opcional)</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <TagPill
                    key={t.id}
                    name={t.name}
                    color={t.color}
                    active={tagIds.includes(t.id)}
                    onClick={() => toggle(tagIds, setTagIds, t.id)}
                  />
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nova etiqueta..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                maxLength={40}
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1 shrink-0"
                onClick={handleCreateTag}
                disabled={creating || !newTagName.trim()}
              >
                <Plus className="h-4 w-4" />
                Criar
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Salvar na Base
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
