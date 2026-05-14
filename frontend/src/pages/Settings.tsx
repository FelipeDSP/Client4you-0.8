import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Globe,
  Loader2,
  Settings as SettingsIcon,
  Info,
} from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/contexts/PageTitleContext";

/**
 * Settings — pós remoção de WhatsApp e Remarketing.
 * Sobra apenas a configuração de integrações externas (SERP API hoje;
 * SMTP do usuário virá na Fase 1 quando email campaigns chegarem).
 */
export default function Settings() {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle("Configurações", SettingsIcon);
  }, [setPageTitle]);

  const { settings, saveSettings, hasSerpapiKey, isSaving } = useCompanySettings();
  const { toast } = useToast();

  const [serpapiKey, setSerpapiKey] = useState("");
  const [isSavingSerp, setIsSavingSerp] = useState(false);

  useEffect(() => {
    if (settings?.serpapiKey) setSerpapiKey(settings.serpapiKey);
  }, [settings]);

  const handleSaveSerpapiKey = async () => {
    if (!serpapiKey.trim()) {
      toast({
        variant: "destructive",
        title: "Campo obrigatório",
        description: "Por favor, insira uma chave válida.",
      });
      return;
    }

    setIsSavingSerp(true);
    try {
      const success = await saveSettings({ serpapiKey: serpapiKey.trim() });
      if (success) {
        toast({
          title: "Chave salva!",
          description: "Sua chave SERP API foi configurada com sucesso.",
        });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível salvar a chave.",
      });
    } finally {
      setIsSavingSerp(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
        <p className="text-muted-foreground">
          Gerencie as integrações externas da sua conta.
        </p>
      </div>

      {/* SERP API Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${hasSerpapiKey ? "bg-green-100" : "bg-orange-100"}`}>
                <Globe className={`h-5 w-5 ${hasSerpapiKey ? "text-green-600" : "text-orange-600"}`} />
              </div>
              <div>
                <CardTitle>SERP API</CardTitle>
                <CardDescription>Integração para buscar leads no Google Maps</CardDescription>
              </div>
            </div>
            <Badge className={hasSerpapiKey ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>
              {hasSerpapiKey ? "Configurado" : "Pendente"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="serpapi-key" className="text-sm font-medium">
              Chave da API
            </label>
            <Input
              id="serpapi-key"
              type="password"
              placeholder="Cole sua chave SERP API aqui"
              value={serpapiKey}
              onChange={(e) => setSerpapiKey(e.target.value)}
              disabled={isSavingSerp || isSaving}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Obtenha sua chave em:{" "}
              <a
                href="https://serpapi.com/manage-api-key"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                serpapi.com/manage-api-key
              </a>
            </p>
          </div>

          <Button onClick={handleSaveSerpapiKey} disabled={isSavingSerp || !serpapiKey.trim()}>
            {isSavingSerp ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Chave"
            )}
          </Button>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Para que serve?</AlertTitle>
            <AlertDescription>
              A SERP API permite buscar estabelecimentos no Google Maps automaticamente, extraindo
              informações de contato (telefone, endereço, site) para sua base de leads.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Próximas integrações */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-muted-foreground">Próximas integrações</CardTitle>
          <CardDescription>
            SMTP (envio de email) virá na próxima fase. CRM, formulários e tracking também
            estão no roadmap.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
