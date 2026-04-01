import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCampaigns, MessageLog } from "@/hooks/useCampaigns";

interface MessageLogsDialogProps {
  campaignId: string | null;
  campaignName?: string;
  onClose: () => void;
}

export function MessageLogsDialog({ campaignId, campaignName, onClose }: MessageLogsDialogProps) {
  const { getMessageLogs } = useCampaigns();
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (campaignId) {
      loadLogs();
    }
  }, [campaignId]);

  const loadLogs = async () => {
    if (!campaignId) return;
    setIsLoading(true);
    const data = await getMessageLogs(campaignId);
    setLogs(data);
    setIsLoading(false);
  };

  const statusConfig = {
    sent: { label: "Enviado", icon: CheckCircle, color: "text-green-600" },
    error: { label: "Erro", icon: XCircle, color: "text-red-600" },
    pending: { label: "Pendente", icon: Clock, color: "text-yellow-600" },
    skipped: { label: "Ignorado", icon: XCircle, color: "text-gray-600" },
  };

  return (
    <Dialog open={!!campaignId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Logs de Mensagens</DialogTitle>
          <DialogDescription>
            {campaignName || "Campanha"} - {logs.length} registros
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma mensagem enviada ainda.
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {logs.map((log) => {
                const status = statusConfig[log.status];
                const StatusIcon = status.icon;

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                  >
                    <StatusIcon className={`h-5 w-5 mt-0.5 ${status.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{log.contact_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {log.contact_phone}
                        </Badge>
                      </div>
                      {log.error_message && (
                        <p className="text-sm text-red-600 mt-1">
                          Erro: {log.error_message}
                        </p>
                      )}
                      {log.message_sent && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {log.message_sent}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(log.sent_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
