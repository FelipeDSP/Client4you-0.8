import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Search, Send, Bot, ArrowRight, Zap, Users, TrendingUp, Shield, Lock } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { plans } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";

// Seus links de checkout
const CHECKOUT_LINKS: Record<string, string> = {
  basico: "https://pay.kiwify.com.br/FzhyShi",
  intermediario: "https://pay.kiwify.com.br/YlIDqCN",
  avancado: "https://pay.kiwify.com.br/TnUQl3f"
};

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header/Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container relative flex h-16 items-center justify-between">
          {/* Logo (Esquerda) */}
          <div className="flex items-center gap-2">
            <img 
              src="/client4you-icon.png" 
              alt="Client4you" 
              className="h-8 w-8 rounded"
            />
            <span className="text-xl font-bold">Client4you</span>
          </div>
          
          {/* Nav (Centro Absoluto) */}
          <nav className="hidden md:flex gap-6 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <a href="#features" className="text-sm font-medium hover:text-primary transition-colors">
              Recursos
            </a>
            <a href="#pricing" className="text-sm font-medium hover:text-primary transition-colors">
              Preços
            </a>
            <a href="#faq" className="text-sm font-medium hover:text-primary transition-colors">
              FAQ
            </a>
          </nav>
          
          {/* Botões (Direita) */}
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Entrar
              </Button>
            </Link>
            <a href="#pricing">
              <Button size="sm" className="gap-2">
                Começar Agora
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container py-20 md:py-32">
        <div className="mx-auto max-w-5xl text-center space-y-8">
          <Badge variant="secondary" className="text-sm">
            🚀 Captação Inteligente de Clientes
          </Badge>
          
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Do Lead à Conversão<br />
            <span className="text-primary">em Minutos</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Plataforma completa para encontrar, contatar e converter clientes em escala.
            Extrator de leads + Disparador WhatsApp + Automação com IA.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href="#pricing">
              <Button size="lg" className="text-lg h-12 px-8 gap-2">
                Quero Começar Agora
                <ArrowRight className="h-5 w-5" />
              </Button>
            </a>
            <a href="#features">
              <Button size="lg" variant="outline" className="text-lg h-12 px-8">
                Ver Recursos
              </Button>
            </a>
          </div>
          
          <p className="text-sm text-muted-foreground">
            ✓ Sem cartão de crédito  ✓ Cancele quando quiser  ✓ Setup em 5 minutos
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container py-20 bg-slate-50">
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary">Recursos</Badge>
          <h2 className="text-3xl md:text-4xl font-bold">
            Tudo que você precisa<br />em uma única plataforma
          </h2>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="border-2">
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Extrator de Leads</CardTitle>
              <CardDescription>
                Encontre milhares de leads qualificados direto do Google Maps em segundos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Busca por segmento e localização
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Dados completos (nome, telefone, email)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Exportação para Excel/CSV
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-2 border-primary shadow-lg">
            <CardHeader>
              <Badge className="w-fit mb-2">Mais Popular</Badge>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Send className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Disparador WhatsApp</CardTitle>
              <CardDescription>
                Envie mensagens personalizadas em massa via WhatsApp de forma automatizada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Conexão simplificada via QR Code
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Mensagens com variáveis dinâmicas
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Agendamento e controle de horários
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Agente IA Personalizado</CardTitle>
              <CardDescription>
                Automação inteligente que qualifica leads e responde automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Respostas automáticas inteligentes
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Qualificação de leads com IA
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Follow-up automatizado
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container py-20 bg-slate-50">
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary">Preços</Badge>
          <h2 className="text-3xl md:text-4xl font-bold">
            Planos para todo<br />tamanho de negócio
          </h2>
          <p className="text-muted-foreground">
            Escolha o plano ideal. Upgrade ou downgrade quando quiser.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.filter(p => !p.isDemo).map((plan) => {
            const isPopular = plan.id === "intermediario";
            const checkoutLink = CHECKOUT_LINKS[plan.id] || "#pricing";
            
            return (
              <Card key={plan.id} className={`${isPopular ? "border-primary border-2 shadow-lg relative" : ""}`}>
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary">
                      <Star className="h-3 w-3 mr-1 fill-current" />
                      Mais Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold">
                      {plan.price === 0 ? "Grátis" : `R$ ${plan.price.toFixed(2).replace('.', ',')}`}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-muted-foreground">/mês</span>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        {feature.included ? (
                          <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        ) : (
                          <span className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground">−</span>
                        )}
                        <div>
                          <span className={!feature.included ? "text-muted-foreground" : ""}>
                            {feature.name}
                          </span>
                          {feature.limit && feature.included && (
                            <span className="text-xs text-muted-foreground block">
                              {feature.limit}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  
                  <a href={checkoutLink} target="_blank" rel="noopener noreferrer" className="block">
                    <Button 
                      className="w-full" 
                      variant={isPopular ? "default" : "outline"}
                    >
                      Assinar Agora
                    </Button>
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Todos os planos pagos incluem suporte, atualizações e podem ser cancelados a qualquer momento.
        </p>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="container py-20">
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary">FAQ</Badge>
          <h2 className="text-3xl md:text-4xl font-bold">
            Perguntas Frequentes
          </h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Como funciona o período de teste?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Garantia de 7 dias: se você não gostar, devolvemos 100% do seu dinheiro pela própria plataforma de pagamento.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Posso cancelar a qualquer momento?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Sim! Todos os planos são sem fidelidade. Você pode cancelar quando quiser e continua tendo acesso até o fim do período pago.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Como funciona a conexão com WhatsApp?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Nos planos Intermediário e Avançado, você conecta seu WhatsApp escaneando um QR Code. É rápido, seguro e não precisa de servidor próprio.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">O Agente de IA está disponível?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                O Agente de IA personalizado está em desenvolvimento e será lançado em breve exclusivamente no plano Avançado.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preciso de conhecimentos técnicos?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Não! A plataforma foi desenvolvida para ser simples e intuitiva. Em 5 minutos você já consegue fazer sua primeira busca e enviar suas primeiras mensagens.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Final */}
      <section className="container py-20">
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-12">
          <div className="text-center space-y-8 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold">
              Pronto para captar mais clientes?
            </h2>
            <p className="text-xl text-muted-foreground">
              Junte-se a centenas de profissionais que já estão escalando suas vendas com Client4you
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="#pricing">
                <Button size="lg" className="text-lg h-12 px-8 gap-2">
                  Ver Planos e Preços
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 bg-white">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <img 
                  src="/client4you-icon.png" 
                  alt="Client4you" 
                  className="h-8 w-8 rounded"
                />
                <span className="font-bold">Client4you</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Captação inteligente de clientes para profissionais e empresas.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Produto</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-primary">Recursos</a></li>
                <li><a href="#pricing" className="hover:text-primary">Preços</a></li>
                <li><Link to="/login" className="hover:text-primary">Área do Cliente</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Suporte</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#faq" className="hover:text-primary">FAQ</a></li>
                <li><a href="mailto:suporte@client4you.com.br" className="hover:text-primary">Contato</a></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary">Termos de Uso</a></li>
                <li><a href="#" className="hover:text-primary">Privacidade</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>© 2025 Client4you. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}