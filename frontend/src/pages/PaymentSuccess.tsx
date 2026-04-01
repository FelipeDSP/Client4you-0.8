import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Mail, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function PaymentSuccess() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md text-center shadow-xl border-green-100">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800">Pagamento Confirmado!</CardTitle>
          <CardDescription className="text-lg text-slate-600">
            Seja bem-vindo(a) ao Client4you.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-blue-50 p-4 text-left border border-blue-100">
            <h3 className="flex items-center gap-2 font-semibold text-blue-900 mb-2">
              <Mail className="h-5 w-5" />
              Próximos Passos:
            </h3>
            <p className="text-sm text-blue-700 leading-relaxed">
              Sua conta foi criada automaticamente. Enviamos seus dados de acesso (Login e Senha provisória) para o <strong>e-mail que você usou na compra</strong>.
            </p>
          </div>

          <div className="text-sm text-slate-500">
            <p>Não encontrou o e-mail?</p>
            <p>Verifique sua caixa de SPAM ou Lixo Eletrônico.</p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Link to="/login" className="w-full">
            <Button className="w-full h-11 gap-2 bg-green-600 hover:bg-green-700">
              Ir para o Login
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}