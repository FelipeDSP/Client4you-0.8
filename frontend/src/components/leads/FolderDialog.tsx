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
import type { Folder } from "@/hooks/useSegmentsAndTags";

interface FolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Folder | null;
  onSave: (data: { name: string; color: string }) => Promise<void>;
}

/**
 * Cria/edita uma PASTA que agrupa segmentos (v19). Pasta não tem leads
 * direto — é só organização por cima dos segmentos.
 */
export function FolderDialog({ open, onOpenChange, editing, onSave }: FolderDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TAG_COLORS[1]); // laranja
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name || "");
      setColor(editing?.color || TAG_COLORS[1]);
      setSaving(false);
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar pasta" : "Nova pasta"}</DialogTitle>
          <DialogDescription>
            Pastas agrupam seus segmentos pra organizar a barra lateral. Ex.: "Clientes", "Prospecção".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Nome *</Label>
            <Input
              id="folder-name"
              placeholder="Ex.: Clientes, Prospecção, Região Sul..."
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
              "Criar pasta"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
