import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) {
        throw error;
      }

      setIsSubmitted(true);
      toast({
        title: "E-mail enviado!",
        description: "Verifique sua caixa de entrada para redefinir a senha.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao enviar",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950 p-4">
        <Card className="w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-white">Verifique seu E-mail</CardTitle>
            <CardDescription className="text-slate-400">
              Enviamos um link de recuperação para <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link to="/login">
              <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950 p-4">
      <Card className="w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-white">Recuperar Senha</CardTitle>
          <CardDescription className="text-slate-400">
            Digite seu e-mail para receber o link de redefinição
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleReset}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-200">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-slate-600 bg-slate-700/50 pl-10 text-white placeholder:text-slate-400"
                  required
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full bg-orange-600 hover:bg-orange-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar Link"
              )}
            </Button>
            <Link to="/login" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para o Login
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}