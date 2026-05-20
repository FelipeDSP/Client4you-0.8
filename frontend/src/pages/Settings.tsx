import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Globe,
  Loader2,
  Settings as SettingsIcon,
  Info,
  Mail,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import { useEmailAccounts, EmailAccount, CreateEmailAccountPayload } from "@/hooks/useEmailAccounts";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/contexts/PageTitleContext";

// Presets dos provedores mais comuns — pré-preenche host/porta/TLS
const SMTP_PRESETS: Record<string, { label: string; host: string; port: number; use_tls: boolean; hint: string }> = {
  gmail: {
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    use_tls: true,
    hint: "Use uma App Password (Conta Google → Segurança → Senhas de App). A senha normal não funciona se você tiver 2FA.",
  },
  outlook: {
    label: "Outlook / Hotmail",
    host: "smtp.office365.com",
    port: 587,
    use_tls: true,
    hint: "Recomendado usar App Password se sua conta tiver 2FA.",
  },
  yahoo: {
    label: "Yahoo",
    host: "smtp.mail.yahoo.com",
    port: 587,
    use_tls: true,
    hint: "Yahoo exige App Password (conta tem que ter senha de aplicativo gerada).",
  },
  custom: {
    label: "Outro / Custom",
    host: "",
    port: 587,
    use_tls: true,
    hint: "Pergunte ao seu provedor pelas configurações SMTP.",
  },
};

const EMPTY_NEW_ACCOUNT: CreateEmailAccountPayload = {
  name: "",
  from_email: "",
  from_name: "",
  reply_to: "",
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  smtp_use_tls: true,
  daily_limit: 100,
};

export default function Settings() {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle("Configurações", SettingsIcon);
  }, [setPageTitle]);

  const { toast } = useToast();

  // ─── Email Accounts ──
  const {
    accounts,
    isLoading: isLoadingAccounts,
    createAccount,
    deleteAccount,
    verifyAccount,
    isCreating,
    isVerifying,
  } = useEmailAccounts();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAccount, setNewAccount] = useState<CreateEmailAccountPayload>({ ...EMPTY_NEW_ACCOUNT });
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const applyPreset = (key: string) => {
    const p = SMTP_PRESETS[key];
    if (!p) return;
    setNewAccount((s) => ({
      ...s,
      smtp_host: p.host,
      smtp_port: p.port,
      smtp_use_tls: p.use_tls,
    }));
  };

  const handleCreate = async () => {
    if (!newAccount.name || !newAccount.from_email || !newAccount.smtp_host || !newAccount.smtp_user || !newAccount.smtp_password) {
      toast({ variant: "destructive", title: "Campos obrigatórios", description: "Preencha nome, from_email, host, user e senha." });
      return;
    }
    try {
      // Default: smtp_user igual ao from_email se vazio
      const payload = {
        ...newAccount,
        smtp_user: newAccount.smtp_user || newAccount.from_email,
        from_name: newAccount.from_name || undefined,
        reply_to: newAccount.reply_to || undefined,
      };
      await createAccount(payload);
      setShowAddDialog(false);
      setNewAccount({ ...EMPTY_NEW_ACCOUNT });
    } catch {
      // toast já vem do hook
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await verifyAccount(id);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAccount(id);
    } catch {
      // toast já vem do hook
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
        <p className="text-muted-foreground">Contas de email e integrações externas.</p>
      </div>

      <Tabs defaultValue="email" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            Email (SMTP)
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Globe className="h-4 w-4" />
            Integrações
          </TabsTrigger>
        </TabsList>

        {/* ─────────── EMAIL TAB ─────────── */}
        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    Contas SMTP
                  </CardTitle>
                  <CardDescription>
                    Cada conta é um servidor SMTP usado para enviar suas campanhas. A senha é
                    encriptada antes de ser gravada no banco.
                  </CardDescription>
                </div>
                <Button onClick={() => setShowAddDialog(true)} className="gap-2 shrink-0">
                  <Plus className="h-4 w-4" />
                  Adicionar conta
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingAccounts ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed rounded-lg">
                  <Mail className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Nenhuma conta SMTP cadastrada ainda
                  </p>
                  <Button variant="outline" onClick={() => setShowAddDialog(true)}>
                    Adicionar primeira conta
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((acc) => (
                    <EmailAccountRow
                      key={acc.id}
                      account={acc}
                      onVerify={() => handleVerify(acc.id)}
                      onDelete={() => handleDelete(acc.id)}
                      isVerifying={verifyingId === acc.id && isVerifying}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Como funciona?</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed">
              Cada usuário usa o próprio servidor SMTP — Gmail, Outlook, Office365, ou um SMTP
              corporativo. Para Gmail/Outlook com 2FA, você precisa gerar uma "senha de aplicativo"
              específica. Antes de mandar campanha, clique em <strong>Testar conexão</strong> pra
              garantir que as credenciais estão certas.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* ─────────── INTEGRATIONS TAB ─────────── */}
        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100">
                    <Globe className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle>Busca de Leads</CardTitle>
                    <CardDescription>Extração de leads no Google Maps</CardDescription>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-700">Gerenciado pela plataforma</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Nenhuma configuração necessária</AlertTitle>
                <AlertDescription className="text-sm leading-relaxed">
                  A busca de leads é gerenciada pela plataforma — você não precisa
                  configurar nenhuma chave de API. É só ir em <strong>Buscar Leads</strong> e
                  pesquisar. A quantidade de leads disponível depende do seu plano.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─────────── ADD EMAIL ACCOUNT DIALOG ─────────── */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setNewAccount({ ...EMPTY_NEW_ACCOUNT });
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova conta SMTP</DialogTitle>
            <DialogDescription>
              Configure um servidor de envio. Sua senha é encriptada antes de ser gravada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Presets */}
            <div className="space-y-2">
              <Label>Provedor (preset)</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SMTP_PRESETS).map(([key, p]) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(key)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome desta conta *</Label>
              <Input
                id="name"
                placeholder="Ex: Gmail trabalho"
                value={newAccount.name}
                onChange={(e) => setNewAccount((s) => ({ ...s, name: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Só pra você identificar (não vai no email)</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="from_email">From email *</Label>
                <Input
                  id="from_email"
                  type="email"
                  placeholder="voce@empresa.com"
                  value={newAccount.from_email}
                  onChange={(e) => setNewAccount((s) => ({ ...s, from_email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="from_name">From name</Label>
                <Input
                  id="from_name"
                  placeholder="Seu Nome"
                  value={newAccount.from_name || ""}
                  onChange={(e) => setNewAccount((s) => ({ ...s, from_name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reply_to">Reply-To (opcional)</Label>
              <Input
                id="reply_to"
                type="email"
                placeholder="diferente@empresa.com (deixe vazio se for igual ao From)"
                value={newAccount.reply_to || ""}
                onChange={(e) => setNewAccount((s) => ({ ...s, reply_to: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="smtp_host">SMTP Host *</Label>
                <Input
                  id="smtp_host"
                  placeholder="smtp.gmail.com"
                  value={newAccount.smtp_host}
                  onChange={(e) => setNewAccount((s) => ({ ...s, smtp_host: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_port">Porta *</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  value={newAccount.smtp_port}
                  onChange={(e) =>
                    setNewAccount((s) => ({ ...s, smtp_port: parseInt(e.target.value || "587", 10) }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp_user">SMTP User</Label>
              <Input
                id="smtp_user"
                placeholder="Geralmente igual ao From email"
                value={newAccount.smtp_user}
                onChange={(e) => setNewAccount((s) => ({ ...s, smtp_user: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Se deixar vazio, usamos o From email</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp_password">Senha *</Label>
              <Input
                id="smtp_password"
                type="password"
                placeholder="App password ou senha SMTP"
                value={newAccount.smtp_password}
                onChange={(e) => setNewAccount((s) => ({ ...s, smtp_password: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Para Gmail/Outlook com 2FA: use uma "App Password", não a senha do login.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">TLS / STARTTLS</Label>
                  <p className="text-xs text-muted-foreground">Recomendado</p>
                </div>
                <Switch
                  checked={newAccount.smtp_use_tls}
                  onCheckedChange={(v) => setNewAccount((s) => ({ ...s, smtp_use_tls: v }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily_limit">Limite diário</Label>
                <Input
                  id="daily_limit"
                  type="number"
                  value={newAccount.daily_limit}
                  onChange={(e) =>
                    setNewAccount((s) => ({ ...s, daily_limit: parseInt(e.target.value || "100", 10) }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar conta"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Component: row de uma email_account ─────────────────────────────────

function EmailAccountRow({
  account,
  onVerify,
  onDelete,
  isVerifying,
}: {
  account: EmailAccount;
  onVerify: () => void;
  onDelete: () => void;
  isVerifying: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border rounded-lg bg-white">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-900 truncate">{account.name}</span>
          {account.is_verified ? (
            <Badge className="bg-green-100 text-green-700 gap-1">
              <ShieldCheck className="h-3 w-3" />
              Verificado
            </Badge>
          ) : account.last_error ? (
            <Badge className="bg-red-100 text-red-700 gap-1">
              <XCircle className="h-3 w-3" />
              Erro
            </Badge>
          ) : (
            <Badge variant="outline">Pendente</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {account.from_email}{" "}
          <span className="text-xs">
            ({account.smtp_host}:{account.smtp_port})
          </span>
        </p>
        {account.last_error && !account.is_verified && (
          <p className="text-xs text-red-600 mt-1 truncate" title={account.last_error}>
            {account.last_error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onVerify}
          disabled={isVerifying}
          className="gap-2"
        >
          {isVerifying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlugZap className="h-3.5 w-3.5" />
          )}
          Testar
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deletar esta conta SMTP?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação é permanente. Se houver campanhas usando essa conta, a deleção será
                bloqueada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700">
                Deletar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
