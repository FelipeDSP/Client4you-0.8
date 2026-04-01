import { Suspense, lazy } from "react";
import MainLayout from "@/layouts/MainLayout";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import React from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import { PageTitleProvider } from "@/contexts/PageTitleContext";


// Lazy load das páginas
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const History = lazy(() => import("./pages/History"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const Disparador = lazy(() => import("./pages/Disparador"));
const AgenteIA = lazy(() => import("./pages/AgenteIA"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SearchLeads = lazy(() => import("./pages/SearchLeads"));

// Componente de Loading para Suspense
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50">
    <div className="text-center space-y-3">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
      <p className="text-sm text-muted-foreground">Carregando...</p>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 1. O dado é considerado "fresco" por 5 minutos.
      // Se o usuário mudar de aba e voltar em 4min, NÃO faz request.
      staleTime: 1000 * 60 * 5, 
      
      // 2. Mantém o dado na memória (lixo) por 30 minutos caso não seja usado.
      gcTime: 1000 * 60 * 30,
      
      // 3. NÃO busca de novo automaticamente só porque o usuário clicou na janela.
      // Isso economiza MUITOS requests de usuários que ficam trocando de janelas no Windows.
      refetchOnWindowFocus: false,
      
      // 4. Se der erro, tenta mais 1 vez (padrão é 3, o que gasta request à toa se a net caiu)
      retry: 1,
    },
  },
});

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin && user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
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

  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    {/* Landing Page Pública */}
    <Route path="/" element={<LandingPage />} />
    
    <Route
      path="/login"
      element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      }
    />
    <Route
  path="/forgot-password"
  element={
    <PublicRoute>
      <ForgotPassword />
    </PublicRoute>
  }
/>

<Route
  path="/update-password"
  element={
    <ProtectedRoute>
      <UpdatePassword />
    </ProtectedRoute>
  }
/>
    
    <Route
      path="/sucesso"
      element={
        <PublicRoute>
          <PaymentSuccess />
        </PublicRoute>
      }
    />
    

    
    {/* Rotas Protegidas com Layout */}
    <Route
      path="/dashboard"
      element={
        <ProtectedRoute>
          <MainLayout>
            <Dashboard />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    <Route
      path="/search"
      element={
        <ProtectedRoute>
          <MainLayout>
            <SearchLeads />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    <Route
      path="/leads"
      element={
        <ProtectedRoute>
          <MainLayout>
            <History />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    <Route
      path="/history"
      element={
        <ProtectedRoute>
          <MainLayout>
            <History />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    <Route
      path="/profile"
      element={
        <ProtectedRoute>
          <MainLayout>
            <Profile />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    <Route
      path="/settings"
      element={
        <ProtectedRoute>
          <MainLayout>
            <Settings />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    <Route
      path="/disparador"
      element={
        <ProtectedRoute>
          <MainLayout>
            <Disparador />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    <Route
      path="/agente-ia"
      element={
        <ProtectedRoute>
          <MainLayout>
            <AgenteIA />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin"
      element={
        <ProtectedRoute requireAdmin>
          <MainLayout>
            <Admin />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <SubscriptionProvider>
            <PageTitleProvider>
              <Toaster />
              <Sonner />
              <Suspense fallback={<PageLoader />}>
                <AppRoutes />
              </Suspense>
            </PageTitleProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
