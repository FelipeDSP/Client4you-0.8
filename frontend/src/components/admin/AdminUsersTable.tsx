import { Search, CheckCircle, XCircle, Edit, Play, Ban, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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

interface AdminUsersTableProps {
  filteredUsers: any[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isSuspending: string | null;
  isActivating: string | null;
  handleToggleAdmin: (userId: string, userName: string, isSuperAdmin: boolean) => void;
  handleOpenEditQuota: (userId: string) => void;
  handleActivateUser: (userId: string, userName: string, planType: string) => void;
  handleSuspendUser: (userId: string, userName: string) => void;
  handleDeleteUser: (userId: string, userName: string) => void;
}

export function AdminUsersTable({
  filteredUsers,
  searchTerm,
  setSearchTerm,
  isSuspending,
  isActivating,
  handleToggleAdmin,
  handleOpenEditQuota,
  handleActivateUser,
  handleSuspendUser,
  handleDeleteUser
}: AdminUsersTableProps) {
  return (
    <Card className="bg-white shadow-sm border-none">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <CardTitle>Gestão de Usuários</CardTitle>
            <CardDescription>
              Visualize, edite quotas e gerencie permissões.
            </CardDescription>
          </div>
          
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuário..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-gray-50 border-gray-200"
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="rounded-md border border-gray-100 overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="font-semibold text-gray-600">Usuário</TableHead>
                <TableHead className="font-semibold text-gray-600">Empresa</TableHead>
                <TableHead className="text-center font-semibold text-gray-600">Status</TableHead>
                <TableHead className="text-center font-semibold text-gray-600">Admin</TableHead>
                <TableHead className="text-center font-semibold text-gray-600">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => {
                  const isSuspended = user.quotaStatus === 'suspended' || user.quotaStatus === 'canceled';
                  const isExpired = user.quotaExpiresAt && new Date(user.quotaExpiresAt) < new Date();
                  
                  return (
                  <TableRow key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{user.fullName || "Sem nome"}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                        {user.quotaPlanName && (
                          <Badge variant="outline" className="w-fit mt-1 text-xs">
                            {user.quotaPlanName}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-700 font-medium">
                        {user.companyName || <span className="text-muted-foreground italic">Sem empresa</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {isSuspended ? (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Suspenso
                        </Badge>
                      ) : isExpired ? (
                        <Badge variant="outline" className="text-orange-600 border-orange-300 gap-1">
                          <XCircle className="h-3 w-3" />
                          Expirado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600 border-green-300 gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Ativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={user.isSuperAdmin}
                        onCheckedChange={() => 
                          handleToggleAdmin(user.id, user.fullName || user.email, user.isSuperAdmin)
                        }
                        aria-label="Toggle Admin"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditQuota(user.id)}
                          className="h-7 text-xs"
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          Quota
                        </Button>
                        
                        {isSuspended || isExpired ? (
                          <Select 
                            onValueChange={(planType) => handleActivateUser(user.id, user.fullName || user.email, planType)}
                            disabled={isActivating === user.id}
                          >
                            <SelectTrigger className="h-7 w-24 text-xs bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                              {isActivating === user.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Play className="h-3 w-3 mr-1" />
                                  Ativar
                                </>
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="basico">Básico (30d)</SelectItem>
                              <SelectItem value="intermediario">Intermediário (30d)</SelectItem>
                              <SelectItem value="avancado">Avançado (30d)</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                disabled={isSuspending === user.id}
                              >
                                {isSuspending === user.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Ban className="mr-1 h-3 w-3" />
                                    Suspender
                                  </>
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Suspender conta?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O usuário <strong>{user.fullName || user.email}</strong> perderá acesso a todas as funcionalidades.
                                  Você pode reativar a conta a qualquer momento.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                  onClick={() => handleSuspendUser(user.id, user.fullName || user.email)}
                                >
                                  Sim, suspender
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O usuário <strong>{user.fullName || user.email}</strong> será removido permanentemente. 
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700 text-white"
                                onClick={() => handleDeleteUser(user.id, user.fullName || user.email)}
                              >
                                Sim, excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                )})
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
