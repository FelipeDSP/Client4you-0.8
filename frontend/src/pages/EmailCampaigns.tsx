import { useEffect, useState, useMemo } from "react";
import {
  Mail,
  Plus,
  Send,
  Pause,
  Ban,
  Trash2,
  Loader2,
  Users,
  Eye,
  MousePointerClick,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Variable,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/contexts/PageTitleContext";
import {
  useEmailCampaigns,
  useCampaignRecipients,
  EmailCampaign,
  EmailCampaignStatus,
  CreateCampaignPayload,
} from "@/hooks/useEmailCampaigns";
import { useEmailAccounts } from "@/hooks/useEmailAccounts";
import { useLeads } from "@/hooks/useLeads";

const STATUS_META: Record<EmailCampaignStatus, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  scheduled: { label: "Agendada", className: "bg-blue-100 text-blue-700" },
  sending: { label: "Enviando", className: "bg-green-100 text-green-700 animate-pulse" },
  sent: { label: "Concluída", className: "bg-purple-100 text-purple-700" },
  paused: { label: "Pausada", className: "bg-yellow-100 text-yellow-700" },
  cancelled: { label: "Cancelada", className: "bg-slate-100 text-slate-500" },
  failed: { label: "Falhou", className: "bg-red-100 text-red-700" },
};

const TEMPLATE_VARS = ["nome", "email"];

const DEFAULT_BODY_HTML = `<p>Olá {{nome}},</p>
<p>Espero que esteja bem. Estou entrando em contato porque...</p>
<p>Atenciosamente,<br>Seu nome</p>`;

export default function EmailCampaigns() {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle("Campanhas de Email", Mail);
  }, [setPageTitle]);

  const {
    campaigns,
    isLoading,
    createCampaign,
    deleteCampaign,
    sendCampaign,
    pauseCampaign,
    cancelCampaign,
    isCreating,
  } = useEmailCampaigns();

  const { accounts: emailAccounts, isLoading: isLoadingAccounts } = useEmailAccounts();
  const verifiedAccounts = useMemo(() => emailAccounts.filter((a) => a.is_verified), [emailAccounts]);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createdCampaign, setCreatedCampaign] = useState<EmailCampaign | null>(null);
  const [showAddRecipientsDialog, setShowAddRecipientsDialog] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<EmailCampaign | null>(null);

  const handleCreate = async (payload: CreateCampaignPayload) => {
    try {
      const campaign = await createCampaign(payload);
      setCreatedCampaign(campaign);
      setShowCreateDialog(false);
      setShowAddRecipientsDialog(true);
    } catch {
      // toast já vem do hook
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Campanhas de Email</h2>
          <p className="text-muted-foreground mt-1">
            Crie e dispare campanhas usando seu próprio SMTP.
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          disabled={isLoadingAccounts || verifiedAccounts.length === 0}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Nova campanha
        </Button>
      </div>

      {/* Aviso se não tem conta SMTP verificada */}
      {!isLoadingAccounts && verifiedAccounts.length === 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800">Nenhuma conta SMTP verificada</AlertTitle>
          <AlertDescription className="text-orange-700">
            Para criar campanhas você precisa de pelo menos uma conta SMTP verificada.{" "}
            <Link to="/settings" className="font-medium underline">
              Ir para Configurações
            </Link>{" "}
            e configurar uma.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma campanha ainda</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Crie sua primeira campanha de email pra começar.
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              disabled={verifiedAccounts.length === 0}
              variant="outline"
            >
              <Plus className="mr-2 h-4 w-4" />
              Criar primeira campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onView={() => setDetailCampaign(c)}
              onSend={() => sendCampaign(c.id)}
              onPause={() => pauseCampaign(c.id)}
              onCancel={() => cancelCampaign(c.id)}
              onAddRecipients={() => {
                setCreatedCampaign(c);
                setShowAddRecipientsDialog(true);
              }}
              onDelete={() => deleteCampaign(c.id)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateCampaignDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        verifiedAccounts={verifiedAccounts}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
      />
      <AddRecipientsDialog
        open={showAddRecipientsDialog}
        onOpenChange={(open) => {
          setShowAddRecipientsDialog(open);
          if (!open) setCreatedCampaign(null);
        }}
        campaign={createdCampaign}
      />
      <CampaignDetailDialog
        open={!!detailCampaign}
        onOpenChange={(open) => !open && setDetailCampaign(null)}
        campaign={detailCampaign}
      />
    </div>
  );
}

// ─── CampaignCard ────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  onView,
  onSend,
  onPause,
  onCancel,
  onAddRecipients,
  onDelete,
}: {
  campaign: EmailCampaign;
  onView: () => void;
  onSend: () => Promise<unknown>;
  onPause: () => Promise<unknown>;
  onCancel: () => Promise<unknown>;
  onAddRecipients: () => void;
  onDelete: () => Promise<unknown>;
}) {
  const meta = STATUS_META[campaign.status];
  const sentProgress = campaign.total_recipients > 0
    ? (campaign.sent_count / campaign.total_recipients) * 100
    : 0;
  const openRate = campaign.sent_count > 0
    ? (campaign.opened_count / campaign.sent_count) * 100
    : 0;
  const clickRate = campaign.sent_count > 0
    ? (campaign.clicked_count / campaign.sent_count) * 100
    : 0;

  const canSend = campaign.status === "draft" || campaign.status === "paused";
  const canPause = campaign.status === "sending";
  const canCancel = ["sending", "paused", "scheduled"].includes(campaign.status);
  const canDelete = campaign.status !== "sending";
  const canAddRecipients = ["draft", "paused"].includes(campaign.status);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{campaign.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1 truncate" title={campaign.subject}>
              {campaign.subject}
            </p>
          </div>
          <Badge className={meta.className}>{meta.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Enviados</span>
            <span className="font-medium">
              {campaign.sent_count} / {campaign.total_recipients}
            </span>
          </div>
          <Progress value={sentProgress} className="h-2" />
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-slate-50 py-2">
            <div className="text-lg font-bold text-slate-900">{campaign.opened_count}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Aberturas
              {campaign.sent_count > 0 && (
                <span className="ml-1 text-emerald-600">({openRate.toFixed(0)}%)</span>
              )}
            </div>
          </div>
          <div className="rounded bg-slate-50 py-2">
            <div className="text-lg font-bold text-slate-900">{campaign.clicked_count}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Cliques
              {campaign.sent_count > 0 && (
                <span className="ml-1 text-emerald-600">({clickRate.toFixed(0)}%)</span>
              )}
            </div>
          </div>
          <div className="rounded bg-slate-50 py-2">
            <div className="text-lg font-bold text-red-600">
              {campaign.bounced_count + campaign.failed_count}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Falhas</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button size="sm" variant="outline" onClick={onView} className="gap-1">
            <Eye className="h-3.5 w-3.5" />
            Detalhes
          </Button>

          {canAddRecipients && (
            <Button size="sm" variant="outline" onClick={onAddRecipients} className="gap-1">
              <Users className="h-3.5 w-3.5" />
              Recipients
            </Button>
          )}

          {canSend && (
            <Button
              size="sm"
              onClick={() => onSend()}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={campaign.total_recipients === 0}
            >
              <Send className="h-3.5 w-3.5" />
              Enviar
            </Button>
          )}

          {canPause && (
            <Button size="sm" variant="outline" onClick={() => onPause()} className="gap-1">
              <Pause className="h-3.5 w-3.5" />
              Pausar
            </Button>
          )}

          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel()}
              className="gap-1 text-orange-600 hover:text-orange-700"
            >
              <Ban className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          )}

          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 text-red-600 hover:text-red-700 ml-auto">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deletar campanha?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é permanente. Os recipients e eventos também serão removidos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete()} className="bg-red-600 hover:bg-red-700">
                    Deletar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CreateCampaignDialog ─────────────────────────────────────────────────

function CreateCampaignDialog({
  open,
  onOpenChange,
  verifiedAccounts,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  verifiedAccounts: ReturnType<typeof useEmailAccounts>["accounts"];
  onSubmit: (p: CreateCampaignPayload) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY_HTML);
  const [accountId, setAccountId] = useState<string>("");
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const { toast } = useToast();

  useEffect(() => {
    if (open && verifiedAccounts.length > 0 && !accountId) {
      setAccountId(verifiedAccounts[0].id);
    }
  }, [open, verifiedAccounts, accountId]);

  const reset = () => {
    setName("");
    setSubject("");
    setBodyHtml(DEFAULT_BODY_HTML);
    setIntervalSeconds(30);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim() || !accountId) {
      toast({ variant: "destructive", title: "Campos obrigatórios", description: "Preencha nome, assunto, corpo e conta SMTP." });
      return;
    }
    await onSubmit({
      name: name.trim(),
      subject: subject.trim(),
      body_html: bodyHtml,
      email_account_id: accountId,
      interval_seconds: intervalSeconds,
    });
    reset();
  };

  const insertVariable = (varName: string) => {
    setBodyHtml((s) => s + ` {{${varName}}}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova campanha de email</DialogTitle>
          <DialogDescription>
            Crie o conteúdo. Depois você adiciona destinatários e dispara.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Nome interno *</Label>
              <Input
                id="name"
                placeholder="Ex: Outreach SaaS B2B - Maio"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account">Conta SMTP *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {verifiedAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.from_email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Assunto *</Label>
            <Input
              id="subject"
              placeholder="Ex: {{nome}}, tem 5 minutos pra conversar?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Suporta variáveis (clica nos chips abaixo)</p>
          </div>

          {/* Variable chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <Variable className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Variáveis:</span>
            {TEMPLATE_VARS.map((v) => (
              <Badge
                key={v}
                variant="outline"
                className="cursor-pointer hover:bg-slate-100 font-mono text-xs"
                onClick={() => insertVariable(v)}
              >
                {`{{${v}}}`}
              </Badge>
            ))}
          </div>

          {/* HTML + Preview side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Corpo (HTML)</Label>
              <Textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={16}
                className="font-mono text-xs"
                placeholder="<p>Olá {{nome}},</p>..."
              />
            </div>
            <div className="space-y-2">
              <Label>Preview</Label>
              <div
                className="border rounded h-[400px] overflow-auto bg-white p-4 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: bodyHtml || "<p class='text-slate-400'>Preview vazio</p>" }}
              />
              <p className="text-xs text-muted-foreground">
                Variáveis ({`{{nome}}`}, {`{{email}}`}) aparecem aqui sem substituição. No envio
                real, cada destinatário recebe a versão personalizada.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interval">Intervalo entre envios (segundos)</Label>
            <Input
              id="interval"
              type="number"
              min={5}
              max={3600}
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(parseInt(e.target.value || "30", 10))}
              className="max-w-[200px]"
            />
            <p className="text-xs text-muted-foreground">
              30s é razoável pra Gmail; aumente se sentir bounce.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar campanha"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AddRecipientsDialog ──────────────────────────────────────────────────

function AddRecipientsDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaign: EmailCampaign | null;
}) {
  const { leads, isLoading } = useLeads();
  const { addRecipientsFromLeads, isAddingRecipients } = useEmailCampaigns();

  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const eligibleLeads = useMemo(
    () => leads.filter((l) => !!l.email),
    [leads]
  );

  const filteredLeads = useMemo(() => {
    if (!filter) return eligibleLeads;
    const q = filter.toLowerCase();
    return eligibleLeads.filter(
      (l) =>
        (l.name || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (l.category || "").toLowerCase().includes(q)
    );
  }, [eligibleLeads, filter]);

  useEffect(() => {
    if (!open) {
      setFilter("");
      setSelected(new Set());
    }
  }, [open]);

  const toggleAll = () => {
    if (selected.size === filteredLeads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  const handleAdd = async () => {
    if (!campaign || selected.size === 0) return;
    try {
      await addRecipientsFromLeads({
        campaignId: campaign.id,
        leadIds: Array.from(selected),
      });
      onOpenChange(false);
    } catch {
      // toast já vem do hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar destinatários</DialogTitle>
          <DialogDescription>
            {campaign && (
              <>
                Adicionando à campanha <strong>{campaign.name}</strong>. Só leads com email são
                elegíveis. Leads já adicionados são automaticamente pulados.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Filtrar por nome, email ou categoria..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={toggleAll}
            >
              {selected.size === filteredLeads.length && filteredLeads.length > 0
                ? "Desmarcar todos"
                : "Selecionar todos"}
            </button>
            <span className="text-muted-foreground">
              {selected.size} selecionados • {filteredLeads.length} elegíveis
              {leads.length > eligibleLeads.length && (
                <span className="text-orange-600 ml-2">
                  ({leads.length - eligibleLeads.length} sem email pulados)
                </span>
              )}
            </span>
          </div>

          <div className="border rounded max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                Nenhum lead encontrado com esse filtro.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Categoria</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.slice(0, 200).map((l) => (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => {
                        setSelected((s) => {
                          const next = new Set(s);
                          if (next.has(l.id)) next.delete(l.id);
                          else next.add(l.id);
                          return next;
                        });
                      }}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(l.id)}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell className="font-medium truncate max-w-[200px]">{l.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[220px]">
                        {l.email}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {l.category || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {filteredLeads.length > 200 && (
            <p className="text-xs text-muted-foreground">
              Mostrando primeiros 200. Use o filtro pra refinar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selected.size === 0 || isAddingRecipients}
          >
            {isAddingRecipients ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adicionando...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar {selected.size} destinatário(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CampaignDetailDialog ─────────────────────────────────────────────────

const RECIPIENT_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Enviado", className: "bg-blue-100 text-blue-700" },
  delivered: { label: "Entregue", className: "bg-emerald-100 text-emerald-700" },
  opened: { label: "Aberto", className: "bg-emerald-100 text-emerald-700" },
  clicked: { label: "Clicou", className: "bg-purple-100 text-purple-700" },
  bounced: { label: "Bounce", className: "bg-red-100 text-red-700" },
  unsubscribed: { label: "Unsub", className: "bg-orange-100 text-orange-700" },
  failed: { label: "Falhou", className: "bg-red-100 text-red-700" },
};

function CampaignDetailDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaign: EmailCampaign | null;
}) {
  const { recipients, total, isLoading } = useCampaignRecipients(campaign?.id ?? null);

  if (!campaign) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {campaign.name}
            <Badge className={STATUS_META[campaign.status].className}>
              {STATUS_META[campaign.status].label}
            </Badge>
          </DialogTitle>
          <DialogDescription>{campaign.subject}</DialogDescription>
        </DialogHeader>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox label="Total" value={campaign.total_recipients} icon={Users} color="slate" />
          <StatBox label="Enviados" value={campaign.sent_count} icon={Send} color="blue" />
          <StatBox label="Aberturas" value={campaign.opened_count} icon={Eye} color="emerald" />
          <StatBox label="Cliques" value={campaign.clicked_count} icon={MousePointerClick} color="purple" />
          <StatBox label="Bounces" value={campaign.bounced_count} icon={AlertCircle} color="red" />
          <StatBox label="Falhas" value={campaign.failed_count} icon={AlertCircle} color="red" />
          <StatBox label="Unsub" value={campaign.unsubscribed_count} icon={ExternalLink} color="orange" />
          <StatBox
            label="Pendentes"
            value={Math.max(0, campaign.total_recipients - campaign.sent_count - campaign.bounced_count - campaign.failed_count)}
            icon={Loader2}
            color="slate"
          />
        </div>

        {/* Recipients table */}
        <div className="space-y-2">
          <h3 className="font-medium">Destinatários ({total})</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : recipients.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground border rounded">
              Nenhum destinatário adicionado ainda.
            </div>
          ) : (
            <div className="border rounded max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aberturas</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((r) => {
                    const meta = RECIPIENT_STATUS_META[r.status] || RECIPIENT_STATUS_META.pending;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-mono">{r.email}</TableCell>
                        <TableCell className="text-sm">{r.name || "-"}</TableCell>
                        <TableCell>
                          <Badge className={meta.className}>{meta.label}</Badge>
                          {r.failure_reason && (
                            <p className="text-[10px] text-red-600 mt-1 max-w-[200px] truncate" title={r.failure_reason}>
                              {r.failure_reason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{r.open_count}</TableCell>
                        <TableCell className="text-right text-sm">{r.click_count}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: "slate" | "blue" | "emerald" | "purple" | "red" | "orange";
}) {
  const colorMap = {
    slate: "text-slate-600 bg-slate-100",
    blue: "text-blue-600 bg-blue-100",
    emerald: "text-emerald-600 bg-emerald-100",
    purple: "text-purple-600 bg-purple-100",
    red: "text-red-600 bg-red-100",
    orange: "text-orange-600 bg-orange-100",
  } as const;
  return (
    <div className="rounded-lg border p-3 bg-white">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={`p-1 rounded ${colorMap[color]}`}>
          <Icon className="h-3 w-3" />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
