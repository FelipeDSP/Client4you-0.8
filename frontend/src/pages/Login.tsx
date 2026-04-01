import { useState } from "react";
import { useNavigate, Link } from "react-router-dom"; // Link adicionado aqui
import { Loader2, Mail, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// Validação simples de email
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const validateForm = (): boolean => {
    let isValid = true;
    setEmailError("");
    setPasswordError("");

    if (!email.trim()) {
      setEmailError("O email é obrigatório");
      isValid = false;
    } else if (!isValidEmail(email)) {
      setEmailError("Digite um email válido");
      isValid = false;
    }

    if (!password) {
      setPasswordError("A senha é obrigatória");
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError("A senha deve ter no mínimo 6 caracteres");
      isValid = false;
    }

    return isValid;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);

    const result = await login(email.trim(), password);

    if (result.success) {
      toast({
        title: "Login realizado!",
        description: "Bem-vindo de volta.",
      });
      navigate("/dashboard");
    } else {
      toast({
        title: "Erro no login",
        description: result.error || "Verifique suas credenciais e tente novamente.",
        variant: "destructive",
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,170,0,0.15),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(0,102,204,0.1),transparent_50%)]" />
      
      <Card className="relative w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader className="text-center pb-2">
          {/* Voltou para mb-4 e h-20 (original) */}
          <div className="mx-auto mb-4 flex items-center justify-center">
            <img 
              src="/client4you-logo-color.png" 
              alt="Client4you" 
              className="h-20 w-auto" 
            />
          </div>
          
          <CardDescription className="text-slate-400 text-lg">
            Acesse sua conta para gerenciar seus leads
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-slate-200">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="login-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError("");
                  }}
                  className={`border-slate-600 bg-slate-700/50 pl-10 text-white placeholder:text-slate-400 ${emailError ? "border-red-500" : ""}`}
                />
              </div>
              {emailError && (
                <p className="text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {emailError}
                </p>
              )}
            </div>
            
            {/* Campo de Senha com Link de Recuperação */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="login-password" className="text-slate-200">Senha</Label>
                <Link 
                  to="/forgot-password" 
                  className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError("");
                  }}
                  className={`border-slate-600 bg-slate-700/50 pl-10 text-white placeholder:text-slate-400 ${passwordError ? "border-red-500" : ""}`}
                />
              </div>
              {passwordError && (
                <p className="text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {passwordError}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-4 pt-4">
            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold bg-gradient-to-r from-[#FF8C00] via-[#FFAA00] to-[#FFC300] hover:from-[#FF7700] hover:via-[#FF9500] hover:to-[#FFB800] shadow-lg shadow-orange-500/20"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Acessar Plataforma"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}