// Exemplo de estrutura para src/layouts/MainLayout.tsx
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar" // Você precisará criar este componente com o menu
import { Bell, User } from "lucide-react"
import { usePageTitle } from "@/contexts/PageTitleContext"
import { NotificationDropdown } from "@/components/NotificationDropdown"
import { useAuth } from "@/hooks/useAuth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { LogOut, Settings as SettingsIcon } from "lucide-react"
import { Link } from "react-router-dom"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { title, icon: Icon } = usePageTitle();
  const { user, logout } = useAuth();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50"> {/* Fundo geral cinza claro */}
        <AppSidebar /> {/* Sua Sidebar Azul */}
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-16 border-b bg-white flex items-center justify-between px-6 shadow-sm z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <h1 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                {Icon && <Icon className="h-6 w-6 text-primary" />}
                {title}
              </h1>
            </div>
            
            <div className="flex items-center gap-4">
               {/* Ícone de Notificação funcional */}
               <NotificationDropdown />
               
               {/* Avatar do Usuário com Dropdown */}
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                     <Avatar className="h-10 w-10">
                       <AvatarImage src={user?.avatarUrl} alt={user?.name || "User"} />
                       <AvatarFallback className="bg-primary text-primary-foreground">
                         {user?.name?.charAt(0).toUpperCase() || "U"}
                       </AvatarFallback>
                     </Avatar>
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent className="w-56 bg-popover" align="end" forceMount>
                   <DropdownMenuLabel className="font-normal">
                     <div className="flex flex-col space-y-1">
                       <p className="text-sm font-medium leading-none">{user?.name}</p>
                       <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                     </div>
                   </DropdownMenuLabel>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem asChild>
                     <Link to="/profile" className="cursor-pointer">
                       <User className="mr-2 h-4 w-4" />
                       Minha Conta
                     </Link>
                   </DropdownMenuItem>
                   <DropdownMenuItem asChild>
                     <Link to="/settings" className="cursor-pointer">
                       <SettingsIcon className="mr-2 h-4 w-4" />
                       Configurações
                     </Link>
                   </DropdownMenuItem>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer">
                     <LogOut className="mr-2 h-4 w-4" />
                     Sair
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
            </div>
          </header>

          {/* Área Principal com Padding Confortável */}
          <div className="flex-1 overflow-auto p-6 md:p-8">
            <div className="mx-auto max-w-6xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
