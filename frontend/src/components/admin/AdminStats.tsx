import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, UserPlus } from "lucide-react";

interface AdminStatsProps {
  totalUsers: number;
  totalAdmins: number;
  totalCompanies: number;
}

export function AdminStats({ totalUsers, totalAdmins, totalCompanies }: AdminStatsProps) {
  const avgUsersPerCompany = totalCompanies > 0 
    ? (totalUsers / totalCompanies).toFixed(1) 
    : "0";

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="bg-white shadow-sm border-none hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total de Usuários</CardTitle>
          <div className="h-8 w-8 bg-blue-50 rounded-full flex items-center justify-center">
            <Users className="h-4 w-4 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-800">{totalUsers}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {totalAdmins} com acesso administrativo
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm border-none hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Empresas Ativas</CardTitle>
          <div className="h-8 w-8 bg-purple-50 rounded-full flex items-center justify-center">
            <Building2 className="h-4 w-4 text-purple-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-800">{totalCompanies}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Organizações no sistema
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm border-none hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Média por Empresa</CardTitle>
          <div className="h-8 w-8 bg-emerald-50 rounded-full flex items-center justify-center">
            <UserPlus className="h-4 w-4 text-emerald-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-800">{avgUsersPerCompany}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Usuários por empresa
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
