import { useState, useCallback, useEffect } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { AdminReauthDialog } from "@/components/AdminReauthDialog";

// Componentes UI
import { AdminStats } from "@/components/admin/AdminStats";
import { AdminCompaniesTable } from "@/components/admin/AdminCompaniesTable";
import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

// Ícones
import { 
  Users, 
  RefreshCw,
  Crown,
  Loader2,
  Trash2,
  Search,
  CheckCircle,
  UserPlus,
  Building2,
  Zap,
  Edit,
  TrendingUp,
  Ban,
  Play,
  XCircle
} from "lucide-react";

// Planos do sistema user_quotas (SEM DEMO)
const QUOTA_PLANS = [
  {
    id: "basico",
    name: "Básico",
    description: "Apenas busca de leads ilimitada",
    color: "blue",
    features: { leads: -1, campaigns: 0, messages: 0 }
  },
  {
    id: "intermediario",
    name: "Intermediário",
    description: "Leads + WhatsApp ilimitados",
    color: "green",
    features: { leads: -1, campaigns: -1, messages: -1 }
  },
  {
    id: "avancado",
    name: "Avançado",
    description: "Completo + Agente IA",
    color: "purple",
    features: { leads: -1, campaigns: -1, messages: -1 }
  },
];

export default function Admin() {
  const { setPageTitle } = usePageTitle();
  
  useEffect(() => {
    setPageTitle("Administração", Crown);
  }, [setPageTitle]);

  const {
    isAdmin,
    isLoading,
    users,
    companies,
    addAdminRole,
    removeAdminRole,
    deleteUser,
    deleteCompany,
    refreshData,
  } = useAdmin();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [updateKey, setUpdateKey] = useState(0);
  
  // Re-authentication state
  const [showReauthDialog, setShowReauthDialog] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Check if re-auth is needed
  useEffect(() => {
    const checkReauth = () => {
      const reauthTime = sessionStorage.getItem('admin_reauth_time');
      const reauthExpires = sessionStorage.getItem('admin_reauth_expires');
      
      if (!reauthTime || !reauthExpires) {
        // No reauth yet, show dialog
        setShowReauthDialog(true);
        setIsAuthenticated(false);
        return;
      }
      
      const now = Date.now();
      const expires = parseInt(reauthExpires);
      
      if (now > expires) {
        // Reauth expired, show dialog again
        sessionStorage.removeItem('admin_reauth_time');
        sessionStorage.removeItem('admin_reauth_expires');
        setShowReauthDialog(true);
        setIsAuthenticated(false);
      } else {
        // Still valid
        setIsAuthenticated(true);
      }
    };
    
    if (isAdmin) {
      checkReauth();
      
      // Check every minute if reauth expired
      const interval = setInterval(checkReauth, 60000);
      return () => clearInterval(interval);
    }
  }, [isAdmin]);
  
  const handleReauthSuccess = () => {
    setIsAuthenticated(true);
    setShowReauthDialog(false);
    toast({
      title: "✅ Acesso concedido",
      description: "Bem-vindo ao painel administrativo.",
    });
  };
  
  const handleReauthCancel = () => {
    setShowReauthDialog(false);
    // Will redirect via Navigate below
  };
  
  // Create user dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserPlan, setNewUserPlan] = useState("intermediario");
  const [isCreating, setIsCreating] = useState(false);

  // Edit quota dialog
  const [showEditQuotaDialog, setShowEditQuotaDialog] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editQuotaPlan, setEditQuotaPlan] = useState("plan_sender");
  const [editLeadsLimit, setEditLeadsLimit] = useState("-1");
  const [editCampaignsLimit, setEditCampaignsLimit] = useState("-1");
  const [editMessagesLimit, setEditMessagesLimit] = useState("-1");
  const [isEditingQuota, setIsEditingQuota] = useState(false);

  // Suspend/Activate user
  const [isSuspending, setIsSuspending] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState<string | null>(null);

  // Force refresh helper
  const forceRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshData();
    setUpdateKey(k => k + 1);
    setIsRefreshing(false);
  }, [refreshData]);

  // Loading State
  if (isLoading || isAdmin === null) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleRefresh = async () => {
    await forceRefresh();
    toast({ title: "Dados atualizados!" });
  };

  // Get user details with quota info
  const usersWithDetails = users.map((user) => {
    const company = companies.find((c) => c.id === user.companyId);
    return {
      ...user,
      company,
      isSuperAdmin: user.roles.includes("super_admin"),
    };
  });

  // Filter users
  const filteredUsers = usersWithDetails.filter((user) => {
    const matchesSearch = 
      user.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (user.fullName?.toLowerCase() || "").includes(userSearch.toLowerCase()) ||
      (user.companyName?.toLowerCase() || "").includes(userSearch.toLowerCase());
    
    return matchesSearch;
  });

  // Filter companies
  const filteredCompanies = companies.filter((company) => {
    return company.name.toLowerCase().includes(companySearch.toLowerCase());
  });

  const handleToggleAdmin = async (userId: string, userName: string, isCurrentlyAdmin: boolean) => {
    let success: boolean;
    
    if (isCurrentlyAdmin) {
      success = await removeAdminRole(userId);
      if (success) {
        toast({
          title: "Admin removido",
          description: `${userName} não é mais administrador.`,
        });
      }
    } else {
      success = await addAdminRole(userId);
      if (success) {
        toast({
          title: "Admin adicionado",
          description: `${userName} agora é administrador.`,
        });
      }
    }
    
    if (success) {
      await forceRefresh();
    } else {
      toast({
        title: "Erro",
        description: "Não foi possível alterar o status de admin.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    const success = await deleteUser(userId);
    if (success) {
      toast({
        title: "Usuário excluído",
        description: `${userName} foi removido do sistema.`,
      });
      await forceRefresh();
    } else {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o usuário.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    const success = await deleteCompany(companyId);
    if (success) {
      toast({
        title: "Empresa excluída",
        description: `${companyName} e todos os dados relacionados foram removidos.`,
      });
      await forceRefresh();
    } else {
      toast({
        title: "Erro",
        description: "Não foi possível excluir a empresa.",
        variant: "destructive",
      });
    }
  };

  // Suspender usuário
  const handleSuspendUser = async (userId: string, userName: string) => {
    setIsSuspending(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");

      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ reason: "Suspenso pelo administrador via painel" })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Erro ao suspender");
      }

      toast({
        title: "Conta suspensa",
        description: `${userName} foi suspenso e não tem mais acesso.`,
      });
      await forceRefresh();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível suspender o usuário.",
        variant: "destructive",
      });
    } finally {
      setIsSuspending(null);
    }
  };

  // Ativar usuário
  const handleActivateUser = async (userId: string, userName: string, planType: string = "basico") => {
    setIsActivating(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");

      const planNames: Record<string, string> = {
        basico: "Plano Básico",
        intermediario: "Plano Intermediário",
        avancado: "Plano Avançado"
      };

      const response = await fetch(`/api/admin/users/${userId}/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          plan_type: planType,
          plan_name: planNames[planType] || "Plano Básico",
          days_valid: 30
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Erro ao ativar");
      }

      toast({
        title: "Conta ativada",
        description: `${userName} foi ativado com ${planNames[planType]} por 30 dias.`,
      });
      await forceRefresh();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível ativar o usuário.",
        variant: "destructive",
      });
    } finally {
      setIsActivating(null);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast({
        title: "Erro",
        description: "Email e senha são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    if (newUserPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter no mínimo 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      const planConfig = QUOTA_PLANS.find(p => p.id === newUserPlan) || QUOTA_PLANS[1];
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Sessão não encontrada. Faça login novamente.");
      }

      const response = await fetch(`${backendUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          full_name: newUserName || undefined,
          plan_type: newUserPlan,
          plan_name: planConfig.name
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Erro ao criar usuário");
      }

      toast({
        title: "Usuário criado!",
        description: `${newUserEmail} foi criado com plano ${planConfig.name}.`,
      });

      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserPlan("intermediario");
      setShowCreateDialog(false);
      
      await forceRefresh();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast({
        title: "Erro ao criar usuário",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEditQuota = async (userId: string) => {
    setEditingUserId(userId);
    
    try {
      // Buscar quota via backend (bypassa RLS com service_role)
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast({
          title: "Erro",
          description: "Sessão não encontrada. Faça login novamente.",
          variant: "destructive",
        });
        return;
      }
      
      const response = await fetch(`${backendUrl}/api/admin/users/${userId}/quota`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const quota = await response.json();
        setEditQuotaPlan(quota.plan_type || "sem_plano");
        setEditLeadsLimit(String(quota.leads_limit ?? -1));
        setEditCampaignsLimit(String(quota.campaigns_limit ?? -1));
        setEditMessagesLimit(String(quota.messages_limit ?? -1));
      } else {
        // Default values se não encontrar
        setEditQuotaPlan("sem_plano");
        setEditLeadsLimit("0");
        setEditCampaignsLimit("0");
        setEditMessagesLimit("0");
      }
    } catch (error) {
      console.error("Erro ao buscar quota:", error);
      // Default values em caso de erro
      setEditQuotaPlan("sem_plano");
      setEditLeadsLimit("0");
      setEditCampaignsLimit("0");
      setEditMessagesLimit("0");
    }
    
    setShowEditQuotaDialog(true);
  };

  const handleSaveQuota = async () => {
    if (!editingUserId) return;

    setIsEditingQuota(true);

    try {
      const planConfig = QUOTA_PLANS.find(p => p.id === editQuotaPlan);
      
      // Usar endpoint do backend
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Sessão não encontrada");
      }
      
      const response = await fetch(`${backendUrl}/api/admin/users/${editingUserId}/quota`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan_type: editQuotaPlan,
          plan_name: planConfig?.name || editQuotaPlan,
          leads_limit: parseInt(editLeadsLimit),
          campaigns_limit: parseInt(editCampaignsLimit),
          messages_limit: parseInt(editMessagesLimit)
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Erro ao atualizar quota");
      }

      toast({
        title: "Quota atualizada!",
        description: "Limites do usuário foram atualizados com sucesso.",
      });

      setShowEditQuotaDialog(false);
      setEditingUserId(null);
      await forceRefresh();
    } catch (error: any) {
      console.error("Error updating quota:", error);
      toast({
        title: "Erro ao atualizar quota",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsEditingQuota(false);
    }
  };

  // Stats
  const totalUsers = users.length;
  const totalAdmins = users.filter((u) => u.roles.includes("super_admin")).length;
  const totalCompanies = companies.length;
  
  // If not authenticated yet, don't show content (wait for dialog)
  if (!isAuthenticated) {
    return (
      <>
        <AdminReauthDialog
          open={showReauthDialog}
          onSuccess={handleReauthSuccess}
          onCancel={handleReauthCancel}
        />
        {!showReauthDialog && <Navigate to="/dashboard" replace />}
      </>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      
      {/* Re-auth Dialog */}
      <AdminReauthDialog
        open={showReauthDialog}
        onSuccess={handleReauthSuccess}
        onCancel={handleReauthCancel}
      />
      
      {/* CABEÇALHO */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
              <Crown className="h-6 w-6 text-primary" />
              Painel Administrativo
            </h2>
            <p className="text-muted-foreground">
              Gestão completa de usuários, empresas e quotas.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" className="bg-white border-gray-200">
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            
            {/* Create User Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Criar Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Usuário</DialogTitle>
                  <DialogDescription>
                    Crie uma conta para um novo cliente manualmente.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input
                      id="name"
                      placeholder="Nome do usuário"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@exemplo.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha *</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan">Plano Inicial</Label>
                    <Select value={newUserPlan} onValueChange={setNewUserPlan}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUOTA_PLANS.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name} - {plan.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateUser} disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      "Criar Usuário"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <Separator className="my-4" />
      </div>

      {/* ESTATÍSTICAS */}
      <AdminStats 
        totalUsers={totalUsers} 
        totalAdmins={totalAdmins} 
        totalCompanies={totalCompanies} 
      />

      {/* TABS: USUÁRIOS E EMPRESAS */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="users" className="data-[state=active]:bg-white">
            <Users className="mr-2 h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="companies" className="data-[state=active]:bg-white">
            <Building2 className="mr-2 h-4 w-4" />
            Empresas
          </TabsTrigger>
        </TabsList>

        {/* TAB: USUÁRIOS */}
        <TabsContent value="users" className="space-y-4">
          <AdminUsersTable 
            filteredUsers={filteredUsers}
            searchTerm={userSearch}
            setSearchTerm={setUserSearch}
            isSuspending={isSuspending}
            isActivating={isActivating}
            handleToggleAdmin={handleToggleAdmin}
            handleOpenEditQuota={handleOpenEditQuota}
            handleActivateUser={handleActivateUser}
            handleSuspendUser={handleSuspendUser}
            handleDeleteUser={handleDeleteUser}
          />
        </TabsContent>

        {/* TAB: EMPRESAS */}
        <TabsContent value="companies" className="space-y-4">
          <AdminCompaniesTable 
            filteredCompanies={filteredCompanies}
            searchTerm={companySearch}
            setSearchTerm={setCompanySearch}
            handleDeleteCompany={handleDeleteCompany}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog: Edit Quota */}
      <Dialog open={showEditQuotaDialog} onOpenChange={setShowEditQuotaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Quota do Usuário</DialogTitle>
            <DialogDescription>
              Configure os limites de uso e plano do usuário. Use -1 para ilimitado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quota-plan">Plano</Label>
              <Select value={editQuotaPlan} onValueChange={(value) => {
                setEditQuotaPlan(value);
                const plan = QUOTA_PLANS.find(p => p.id === value);
                if (plan) {
                  setEditLeadsLimit(String(plan.features.leads));
                  setEditCampaignsLimit(String(plan.features.campaigns));
                  setEditMessagesLimit(String(plan.features.messages));
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUOTA_PLANS.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} - {plan.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="leads-limit">Leads/mês</Label>
                <Input
                  id="leads-limit"
                  type="number"
                  placeholder="-1"
                  value={editLeadsLimit}
                  onChange={(e) => setEditLeadsLimit(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaigns-limit">Campanhas</Label>
                <Input
                  id="campaigns-limit"
                  type="number"
                  placeholder="-1"
                  value={editCampaignsLimit}
                  onChange={(e) => setEditCampaignsLimit(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="messages-limit">Mensagens</Label>
                <Input
                  id="messages-limit"
                  type="number"
                  placeholder="-1"
                  value={editMessagesLimit}
                  onChange={(e) => setEditMessagesLimit(e.target.value)}
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded-md">
              <Zap className="inline h-3 w-3 mr-1" />
              <strong>Dica:</strong> Use -1 para limites ilimitados, 0 para bloquear recurso.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditQuotaDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveQuota} disabled={isEditingQuota}>
              {isEditingQuota ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Quota"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
