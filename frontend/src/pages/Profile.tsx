import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuotas } from "@/hooks/useQuotas";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { User, Building2, CreditCard, Zap, Crown, Loader2, Shield, Mail, KeyRound, Save, Copy, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { QuotaLimitModal } from "@/components/QuotaLimitModal";

export default function Profile() {
  const { setPageTitle } = usePageTitle();
  
  useEffect(() => {
    setPageTitle("Minha Conta", User);
  }, [setPageTitle]);

  const { user } = useAuth();
  const { quota, isLoading: isLoadingQuota } = useQuotas();
  const { toast } = useToast();
  
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Paleta de Cores da Marca
  const BRAND_BLUE = "#054173";
  const BRAND_ORANGE = "#F59600";

  // Carregar dados
  useEffect(() => {
    async function loadProfileData() {
      if (!user) return;
      
      try {
        setLoadingData(true);
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .single();

        if (profile) {
          setName(profile.full_name || user.name || "");
          setAvatarUrl(profile.avatar_url);
        }

        if (user.companyId) {
          const { data: companyData, error } = await supabase
            .from('companies')
            .select('name')
            .eq('id', user.companyId)
            .single();
            
          if (!error && companyData) {
            setCompanyName(companyData.name);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar perfil", error);
      } finally {
        setLoadingData(false);
      }
    }

    loadProfileData();
  }, [user]);

  // Upload de Avatar
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setIsUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Você deve selecionar uma imagem.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${user?.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      toast({
        title: "Foto atualizada!",
        description: "Sua nova foto de perfil foi salva.",
      });

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro no upload",
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Salvar Perfil
  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      const updates = [];

      const profileUpdate = supabase
        .from('profiles')
        .update({ full_name: name })
        .eq('id', user.id);
      updates.push(profileUpdate);

      if (user.companyId && companyName) {
        const companyUpdate = supabase
          .from('companies')
          .update({ name: companyName })
          .eq('id', user.companyId);
        updates.push(companyUpdate);
      }

      await Promise.all(updates);

      toast({
        title: "Perfil salvo!",
        description: "Suas informações foram atualizadas com sucesso.",
        className: "border-l-4 border-[#F59600]" // Laranja no sucesso
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Não foi possível atualizar os dados.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      toast({
        title: "E-mail enviado",
        description: `Link de redefinição enviado para ${user.email}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível enviar o e-mail.",
      });
    }
  };

  const handleCopyCompanyId = () => {
    if (user?.companyId) {
      navigator.clipboard.writeText(user.companyId);
      toast({
        title: "Copiado!",
        description: "ID da empresa copiado.",
      });
    }
  };

  const planName = quota?.plan_name || "Carregando...";
  const planType = quota?.plan_type || "demo";
  
  // Cores dos Planos Ajustadas
  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'demo': return 'bg-slate-500';
      case 'basico': return `bg-[${BRAND_BLUE}]`; // Azul
      case 'intermediario': return `bg-[${BRAND_ORANGE}]`; // Laranja
      case 'avancado': return 'bg-purple-600';
      default: return `bg-[${BRAND_ORANGE}]`;
    }
  };

  if (loadingData && !name) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#F59600]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10 animate-fade-in">
      
      {/* Cabeçalho */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Minha Conta</h2>
        <p className="text-muted-foreground mt-1">Gerencie suas informações pessoais e detalhes da assinatura.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Coluna Esquerda: Dados Pessoais */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                
                {/* Avatar com Cor Sólida Laranja */}
                <div className="relative group">
                  <Avatar className="h-24 w-24 border-4 border-white shadow-lg cursor-pointer">
                    <AvatarImage src={avatarUrl || ""} className="object-cover" />
                    <AvatarFallback className="text-white text-3xl font-bold bg-[#F59600]">
                      {name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  
                  <label 
                    htmlFor="avatar-upload" 
                    className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer backdrop-blur-sm"
                  >
                    {isUploading ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Camera className="h-6 w-6" />
                    )}
                  </label>
                  <input 
                    id="avatar-upload"
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleAvatarUpload}
                    disabled={isUploading}
                  />
                </div>

                <div className="text-center sm:text-left space-y-1 pt-2">
                  <CardTitle className="text-xl">Informações Básicas</CardTitle>
                  <CardDescription>Sua identidade na plataforma Client4You.</CardDescription>
                  <div className="pt-2">
                    {/* Badge de Email em Azul (Institucional) */}
                    <Badge variant="outline" className="text-[#054173] border-[#054173]/20 bg-[#054173]/5 hover:bg-[#054173]/10">
                      <Mail className="h-3 w-3 mr-1" />
                      {user?.email}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-2">
                <Label htmlFor="name" className="text-slate-700">Nome Completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="pl-10 border-slate-200 focus:border-[#F59600] focus:ring-[#F59600]"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="company" className="text-slate-700">Nome da Empresa</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="company"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Nome da sua empresa"
                    className="pl-10 border-slate-200 focus:border-[#F59600] focus:ring-[#F59600]"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-slate-50/50 px-6 py-4 flex justify-end rounded-b-xl border-t border-slate-100">
              <Button 
                onClick={handleSave} 
                disabled={isSaving} 
                className="gap-2 bg-[#F59600] hover:bg-[#F59600]/90 text-white shadow-sm transition-all"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                <Shield className="h-4 w-4 text-[#054173]" />
                Segurança e Acesso
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between p-4 border border-slate-100 rounded-lg bg-white hover:border-slate-200 transition-colors">
                <div className="space-y-1">
                  <p className="font-medium text-slate-900 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-slate-400" /> Senha de Acesso
                  </p>
                  <p className="text-sm text-slate-500">
                    Enviaremos um link seguro para o seu e-mail para redefinição.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleResetPassword} className="gap-2 border-slate-200 hover:bg-slate-50 text-slate-700">
                  Redefinir Senha
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna Direita: Plano e Consumo */}
        <div className="space-y-6">
          <Card className={`border shadow-sm overflow-hidden ${planType === 'avancado' ? 'border-purple-200' : 'border-slate-200'}`}>
            <div className={`h-1.5 w-full ${planType === 'basico' ? 'bg-[#054173]' : planType === 'intermediario' ? 'bg-[#F59600]' : planType === 'avancado' ? 'bg-purple-600' : 'bg-slate-400'}`} />
            <CardHeader className="pb-4 bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Seu Plano</p>
                  <h3 className="text-2xl font-bold text-slate-900">{planName}</h3>
                </div>
                <Badge className={`${planType === 'basico' ? 'bg-[#054173]' : planType === 'intermediario' ? 'bg-[#F59600]' : planType === 'avancado' ? 'bg-purple-600' : 'bg-slate-500'} text-white border-0 capitalize px-3 py-1`}>
                  {planType}
                </Badge>
              </div>
              <p className="text-sm text-slate-500 mt-2 flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                {quota?.plan_expires_at 
                  ? `Renova em ${new Date(quota.plan_expires_at).toLocaleDateString()}` 
                  : "Acesso Vitalício"}
              </p>
            </CardHeader>
            
            <CardContent className="space-y-6 pt-2">
              {/* Barras de Progresso */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 font-medium">Buscas de Leads</span>
                    <span className="text-[#054173] font-bold">
                      {quota?.leads_limit === -1 
                        ? `${quota?.leads_used} / ∞` 
                        : `${quota?.leads_used || 0} / ${quota?.leads_limit || 0}`}
                    </span>
                  </div>
                  <Progress 
                    value={quota?.leads_limit === -1 ? 100 : ((quota?.leads_used || 0) / (quota?.leads_limit || 1)) * 100} 
                    className="h-2 bg-slate-100" 
                    indicatorClassName="bg-[#054173]" // Azul para Leads
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 font-medium">Disparos WhatsApp</span>
                    <span className="text-[#F59600] font-bold">
                      {quota?.messages_limit === -1 
                        ? `${quota?.messages_sent} / ∞` 
                        : `${quota?.messages_sent || 0} / ${quota?.messages_limit || 0}`}
                    </span>
                  </div>
                  <Progress 
                    value={quota?.messages_limit === -1 ? 100 : ((quota?.messages_sent || 0) / (quota?.messages_limit || 1)) * 100} 
                    className="h-2 bg-slate-100"
                    indicatorClassName="bg-[#F59600]" // Laranja para WhatsApp
                  />
                </div>
              </div>

              {planType !== 'avancado' && (
                <Button 
                  className="w-full bg-gradient-to-r from-[#F59600] to-[#e08900] hover:from-[#e08900] hover:to-[#cc7a00] text-white shadow-md border-0 transition-all hover:scale-[1.02]" 
                  onClick={() => setShowUpgradeModal(true)}
                >
                  <Crown className="mr-2 h-4 w-4 text-white/90" />
                  Fazer Upgrade Agora
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Detalhes Técnicos</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-0 pt-0">
              <div className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
                <span className="text-slate-600">ID da Empresa</span>
                <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                  <span className="font-mono text-xs text-slate-500 truncate max-w-[100px]" title={user?.companyId}>
                    {user?.companyId}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 text-slate-400 hover:text-[#054173]" 
                    onClick={handleCopyCompanyId}
                    title="Copiar ID"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between py-3 border-b border-slate-100 last:border-0">
                <span className="text-slate-600">Status</span>
                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                  Ativo
                </span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-slate-600">Membro desde</span>
                <span className="text-slate-900 font-medium">
                  {new Date().getFullYear()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de Upgrade */}
      <QuotaLimitModal 
        open={showUpgradeModal} 
        onOpenChange={setShowUpgradeModal} 
      />
    </div>
  );
}