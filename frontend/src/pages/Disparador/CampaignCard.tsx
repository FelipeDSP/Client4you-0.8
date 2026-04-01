import { useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Upload,
  MoreVertical,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  MessageSquare,
  Users,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Campaign, useCampaigns } from "@/hooks/useCampaigns";

interface CampaignCardProps {
  campaign: Campaign;
  onViewLogs: (campaignId: string) => void;
  wahaConfig?: { url: string; apiKey: string; session: string };
  onRefresh?: () => void;
}

const statusConfig = {
  draft: { label: "Rascunho", variant: "secondary" as const, icon: Clock },
  ready: { label: "Pronta", variant: "default" as const, icon: CheckCircle },
  running: { label: "Em execução", variant: "default" as const, icon: Loader2 },
  paused: { label: "Pausada", variant: "secondary" as const, icon: Pause },
  completed: { label: "Concluída", variant: "default" as const, icon: CheckCircle },
  cancelled: { label: "Cancelada", variant: "destructive" as const, icon: XCircle },
};

export function CampaignCard({ campaign, onViewLogs, wahaConfig, onRefresh }: CampaignCardProps) {
  const { startCampaign, pauseCampaign, resetCampaign, deleteCampaign, uploadContacts, fetchCampaigns } = useCampaigns();
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const status = statusConfig[campaign.status];
  const StatusIcon = status.icon;

  const refreshAfterAction = async () => {
    await fetchCampaigns();
    onRefresh?.();
  };

  const handleStart = async () => {
    setIsLoading(true);
    await startCampaign(campaign.id, wahaConfig);
    await refreshAfterAction();
    setIsLoading(false);
  };

  const handlePause = async () => {
    setIsLoading(true);
    await pauseCampaign(campaign.id);
    await refreshAfterAction();
    setIsLoading(false);
  };

  const handleReset = async () => {
    setIsLoading(true);
    await resetCampaign(campaign.id);
    await refreshAfterAction();
    setIsLoading(false);
  };

  const handleDelete = async () => {
    setIsLoading(true);
    await deleteCampaign(campaign.id);
    await refreshAfterAction();
    setIsLoading(false);
    setShowDeleteDialog(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsLoading(true);
      await uploadContacts(campaign.id, file);
      await refreshAfterAction();
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{campaign.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={status.variant} className="gap-1">
                  <StatusIcon className={`h-3 w-3 ${campaign.status === "running" ? "animate-spin" : ""}`} />
                  {status.label}
                </Badge>
                {campaign.is_worker_running && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Worker Ativo
                  </Badge>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onViewLogs(campaign.id)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Ver Logs
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <label className="flex items-center cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    Reenviar Planilha
                    <Input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleReset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Resetar Campanha
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-2xl font-bold">{campaign.stats.total}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Users className="h-3 w-3" />
                Total
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{campaign.stats.sent}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Enviados
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{campaign.stats.pending}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" />
                Pendentes
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{campaign.stats.errors}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Erros
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Progresso</span>
              <span>{campaign.stats.progress_percent}%</span>
            </div>
            <Progress value={campaign.stats.progress_percent} />
          </div>

          {/* Message Preview */}
          <div className="bg-muted p-2 rounded text-sm">
            <p className="text-muted-foreground text-xs mb-1">Mensagem:</p>
            <p className="line-clamp-2">{campaign.message.text}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {(campaign.status === "ready" || campaign.status === "paused") && (
              <Button onClick={handleStart} disabled={isLoading} className="flex-1">
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                {campaign.status === "paused" ? "Retomar" : "Iniciar"}
              </Button>
            )}
            {campaign.status === "running" && (
              <Button onClick={handlePause} disabled={isLoading} variant="secondary" className="flex-1">
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="mr-2 h-4 w-4" />
                )}
                Pausar
              </Button>
            )}
            {campaign.status === "draft" && (
              <p className="text-sm text-muted-foreground text-center w-full">
                Faça upload de uma planilha para começar
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="text-xs text-muted-foreground">
            Criada em: {new Date(campaign.created_at).toLocaleString("pt-BR")}
            {campaign.started_at && (
              <> | Iniciada: {new Date(campaign.started_at).toLocaleString("pt-BR")}</>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os contatos e logs desta campanha serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
