import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { User as SupabaseUser, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import { toast } from "@/hooks/use-toast";
import { setSessionExpiredCallback } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  sessionToken: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;

  logout: () => Promise<void>;
  signOut: () => Promise<void>;
  handleSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Gerar token único para a sessão
function generateSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// Chave para armazenar o token localmente
const SESSION_TOKEN_KEY = 'app_session_token';

async function fetchUserProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, companies(name)")
    .eq("id", userId)
    .single();

  if (error || !data) {
    console.error("Error fetching profile:", error);
    return null;
  }

  const companyName = (data.companies as any)?.name || "";

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    avatarUrl: data.avatar_url,
    companyId: data.company_id,
    role: (data as any).role || undefined,
    name: data.full_name || data.email.split("@")[0],
    company: companyName,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(() => localStorage.getItem(SESSION_TOKEN_KEY));
  const hasLoggedOutRef = useRef(false);

  // Função para deslogar quando sessão expira em outro dispositivo
  const handleSessionExpired = useCallback(async () => {
    if (hasLoggedOutRef.current) return;
    hasLoggedOutRef.current = true;
    
    console.log('[useAuth] Sessão expirada - outro dispositivo logou');
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setSessionToken(null);
    
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    
    toast({
      title: "Sessão encerrada",
      description: "Sua conta foi acessada em outro dispositivo. Por segurança, você foi desconectado.",
      variant: "destructive",
      duration: 10000,
    });
  }, []);

  // Registrar callback para quando sessão expira via API
  useEffect(() => {
    setSessionExpiredCallback(handleSessionExpired);
  }, [handleSessionExpired]);

  useEffect(() => {
    hasLoggedOutRef.current = false;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        
        if (newSession?.user) {
          setTimeout(async () => {
            const profile = await fetchUserProfile(newSession.user.id);
            setUser(profile);
            setIsLoading(false);
          }, 0);
        } else {
          setUser(null);
          setIsLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      setSession(existingSession);
      
      if (existingSession?.user) {
        const profile = await fetchUserProfile(existingSession.user.id);
        setUser(profile);
      }
      
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      hasLoggedOutRef.current = false;
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // Gerar novo token de sessão e salvar
      if (data.user) {
        const newToken = generateSessionToken();
        console.log('[useAuth] Novo token gerado:', newToken.substring(0, 15));
        localStorage.setItem(SESSION_TOKEN_KEY, newToken);
        setSessionToken(newToken);
        
        // Atualizar token no banco (invalida outras sessões)
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ 
            session_token: newToken,
            last_login_at: new Date().toISOString()
          } as any)
          .eq("id", data.user.id);
        
        if (updateError) {
          console.error("[useAuth] Erro ao atualizar token:", updateError);
        } else {
          console.log("[useAuth] Token atualizado no servidor");
        }
      }

      return { success: true };
    } catch (err) {
      console.error("[useAuth] Erro no login:", err);
      return { success: false, error: "Erro ao fazer login" };
    }
  };



  const logout = async () => {
    hasLoggedOutRef.current = true;
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setSessionToken(null);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    sessionStorage.removeItem('isAdmin');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      isLoading, 
      sessionToken,
      login, 
      logout, 
      signOut: logout,
      handleSessionExpired
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Função utilitária para obter o session token (pode ser usada fora do React)
export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}
