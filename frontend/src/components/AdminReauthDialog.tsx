import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Lock, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AdminReauthDialogProps {
  open: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export function AdminReauthDialog({ open, onSuccess, onCancel }: AdminReauthDialogProps) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
      setShowPassword(false);
    }
  }, [open]);

  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError("Digite sua senha");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Sessão não encontrada. Por favor, faça login novamente.");
      }

      // Call reauth endpoint
      const response = await fetch(`${BACKEND_URL}/api/security/admin/reauth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Erro ao verificar senha");
      }

      // Success
      toast({
        title: "✅ Acesso autorizado",
        description: "Identidade confirmada. Bem-vindo ao painel administrativo.",
      });

      // Store reauth timestamp
      sessionStorage.setItem('admin_reauth_time', Date.now().toString());
      sessionStorage.setItem('admin_reauth_expires', (Date.now() + 1800000).toString()); // 30 min

      onSuccess();
    } catch (error: any) {
      console.error('Reauth error:', error);
      setError(error.message || "Senha incorreta. Tente novamente.");
      
      toast({
        title: "❌ Acesso negado",
        description: error.message || "Senha incorreta",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setPassword("");
    setError("");
    onCancel();
    navigate("/dashboard");
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
            <Shield className="h-6 w-6 text-orange-600" />
          </div>
          <DialogTitle className="text-center">Verificação de Identidade</DialogTitle>
          <DialogDescription className="text-center">
            Para acessar o painel administrativo, confirme sua identidade inserindo sua senha.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleReauth}>
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="reauth-password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="reauth-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  disabled={isLoading}
                  className="pl-10 pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-md bg-blue-50 p-3">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-700">
                  <p className="font-semibold mb-1">Por que isso é necessário?</p>
                  <p className="text-blue-600">
                    O painel administrativo contém dados sensíveis. Esta verificação adicional garante que apenas você tenha acesso.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !password}
              className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Confirmar Identidade
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
