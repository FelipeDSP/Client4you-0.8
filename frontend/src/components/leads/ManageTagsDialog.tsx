import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { TAG_COLORS } from "./TagPill";
import type { Tag } from "@/hooks/useSegmentsAndTags";

interface ManageTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: Tag[];
  onCreate: (name: string, color: string) => Promise<void>;
  onUpdate: (id: string, patch: { name?: string; color?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function ColorSwatch({ color, onPick }: { color: string; onPick: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-6 w-6 rounded-full ring-1 ring-slate-200 shrink-0"
          style={{ backgroundColor: color }}
          aria-label="Escolher cor"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="grid grid-cols-6 gap-2">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPick(c)}
              className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-slate-500" : ""}`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ManageTagsDialog({ open, onOpenChange, tags, onCreate, onUpdate, onDelete }: ManageTagsDialogProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onCreate(name, newColor);
      setNewName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar etiquetas</DialogTitle>
          <DialogDescription>
            Rótulos rápidos pra marcar leads (ex.: quente, respondeu, sem site) e filtrar por eles.
            Compartilhadas com a empresa.
          </DialogDescription>
        </DialogHeader>

        {/* Nova etiqueta */}
        <div className="flex items-center gap-2">
          <ColorSwatch color={newColor} onPick={setNewColor} />
          <Input
            placeholder="Nome da etiqueta"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            maxLength={40}
          />
          <Button onClick={handleCreate} disabled={busy || !newName.trim()} size="sm" className="gap-1 shrink-0">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {/* Lista */}
        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma etiqueta ainda.</p>
          ) : (
            tags.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <ColorSwatch color={t.color} onPick={(c) => onUpdate(t.id, { color: c })} />
                <Input
                  defaultValue={t.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== t.name) onUpdate(t.id, { name: v });
                  }}
                  maxLength={40}
                  className="h-8"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  onClick={() => onDelete(t.id)}
                  title="Excluir etiqueta"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
