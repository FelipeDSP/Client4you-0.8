import { Search, CheckCircle, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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

interface AdminCompaniesTableProps {
  filteredCompanies: any[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  handleDeleteCompany: (companyId: string, companyName: string) => void;
}

export function AdminCompaniesTable({
  filteredCompanies,
  searchTerm,
  setSearchTerm,
  handleDeleteCompany
}: AdminCompaniesTableProps) {
  return (
    <Card className="bg-white shadow-sm border-none">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <CardTitle>Gestão de Empresas</CardTitle>
            <CardDescription>
              Visualize e gerencie todas as organizações.
            </CardDescription>
          </div>
          
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa..."
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
                <TableHead className="font-semibold text-gray-600">Empresa</TableHead>
                <TableHead className="text-center font-semibold text-gray-600">Membros</TableHead>
                <TableHead className="text-center font-semibold text-gray-600">Status</TableHead>
                <TableHead className="text-center font-semibold text-gray-600">Plano</TableHead>
                <TableHead className="text-right font-semibold text-gray-600 pr-6">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                    Nenhuma empresa encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCompanies.map((company) => (
                  <TableRow key={company.id} className="hover:bg-gray-50/50 transition-colors">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{company.name}</span>
                        <span className="text-xs text-muted-foreground">{company.slug}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {company.membersCount} {company.membersCount === 1 ? 'membro' : 'membros'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {company.subscription?.status === "active" ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                          <CheckCircle className="h-3 w-3" /> Ativa
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                          Inativa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-medium text-gray-700">
                        {company.subscription?.planId || "N/A"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A empresa <strong>{company.name}</strong> e todos os dados relacionados (leads, campanhas, usuários) serão removidos permanentemente. 
                              Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => handleDeleteCompany(company.id, company.name)}
                            >
                              Sim, excluir tudo
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
