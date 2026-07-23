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
import { Loader2 } from "lucide-react";
import { TAG_COLORS } from "./TagPill";
import type { Segment } from "@/hooks/useSegmentsAndTags";

interface SegmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Segment | null;
  onSave: (data: { name: string; color: string; description: string }) => Promise<void>;
}

export function SegmentDialog({ open, onOpenChange, editing, onSave }: SegmentDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TAG_COLORS[7]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name || "");
      setColor(editing?.color || TAG_COLORS[7]);
      setDescription(editing?.description || "");
      setSaving(false);
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color, description: description.trim() });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar segmento" : "Novo segmento"}</DialogTitle>
          <DialogDescription>
            Segmentos são listas de leads que você trabalha (ex.: uma campanha, uma região). Um lead pode estar em vários.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="seg-name">Nome *</Label>
            <Input
              id="seg-name"
              placeholder="Ex.: Restaurantes SP, Clientes quentes..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !saving) handleSave();
              }}
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-slate-500 scale-110" : ""}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="seg-desc">Descrição (opcional)</Label>
            <Input
              id="seg-desc"
              placeholder="Uma nota rápida sobre esse segmento"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : editing ? (
              "Salvar"
            ) : (
              "Criar segmento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
