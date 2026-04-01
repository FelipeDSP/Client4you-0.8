import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  companyId: string | null;
  companyName: string | null;
  roles: AppRole[];
  createdAt: string;
  // Dados de quota/plano
  quotaPlanType: string | null;
  quotaPlanName: string | null;
  quotaStatus: string | null;
  quotaExpiresAt: string | null;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  membersCount: number;
  subscription: {
    planId: string;
    status: string;
    demoUsed: boolean;
  } | null;
}

export function useAdmin() {
  // Pegamos user, session e isLoading (como authLoading)
  const { user, session, isLoading: authLoading } = useAuth() as any;
  
  const [isAdmin, setIsAdmin] = useState<boolean | null>(() => {
    // Tenta recuperar do sessionStorage para evitar flicker
    const cached = sessionStorage.getItem('isAdmin');
    return cached !== null ? cached === 'true' : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Check if current user is admin
  const checkAdminStatus = useCallback(async () => {
    // Se a sessão é undefined ou o auth está carregando, mantém loading
    if (session === undefined || authLoading === true) {
      setIsLoading(true);
      return;
    }

    if (!user?.id) {
      setIsAdmin(false);
      setIsLoading(false);
      sessionStorage.setItem('isAdmin', 'false');
      return;
    }

    // Mantém loading enquanto faz a verificação
    setIsLoading(true);

    try {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "super_admin",
      });

      if (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
        sessionStorage.setItem('isAdmin', 'false');
      } else {
        const adminStatus = data === true;
        setIsAdmin(adminStatus);
        sessionStorage.setItem('isAdmin', String(adminStatus));
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
      setIsAdmin(false);
      sessionStorage.setItem('isAdmin', 'false');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, session, authLoading]);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  // Fetch all users (admin only)
  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) return;

      const response = await fetch(`${backendUrl}/api/admin/users?limit=1000`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      if (!response.ok) throw new Error("Failed to fetch users from API");
      
      const data = await response.json();
      
      const mappedUsers: AdminUser[] = (data.users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        companyId: u.company_id,
        companyName: u.company_name,
        roles: u.roles || [],
        createdAt: u.created_at,
        quotaPlanType: u.plan_type,
        quotaPlanName: u.plan_name,
        quotaStatus: u.status,
        quotaExpiresAt: u.expires_at,
      }));

      setUsers(mappedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }, [isAdmin]);

  // Fetch all companies (admin only)
  const fetchCompanies = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) return;

      const response = await fetch(`${backendUrl}/api/admin/companies?limit=1000`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      if (!response.ok) throw new Error("Failed to fetch companies from API");
      
      const data = await response.json();
      
      const mappedCompanies: Company[] = (data.companies || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        createdAt: c.createdAt,
        membersCount: c.membersCount,
        subscription: c.subscription,
      }));

      setCompanies(mappedCompanies);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchCompanies();
    }
  }, [isAdmin, fetchUsers, fetchCompanies]);

  // Delete a company via backend (transactional, with audit log)
  const deleteCompany = async (companyId: string): Promise<boolean> => {
    if (!isAdmin) return false;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const token = session?.access_token;
      
      if (!token) {
        console.error("No access token available");
        return false;
      }

      const response = await fetch(`${backendUrl}/api/admin/companies/${companyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Error deleting company:", error);
        return false;
      }

      await fetchCompanies();
      await fetchUsers();
      return true;
    } catch (error) {
      console.error("Error deleting company:", error);
      return false;
    }
  };

  // Delete a single user via backend
  const deleteUser = async (userId: string): Promise<boolean> => {
    if (!isAdmin) return false;

    // Prevent deleting yourself
    if (userId === user?.id) return false;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const token = session?.access_token;
      
      if (!token) {
        console.error("No access token available");
        return false;
      }
      
      const response = await fetch(`${backendUrl}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error("Error deleting user:", error);
        return false;
      }

      await fetchUsers();
      await fetchCompanies();
      return true;
    } catch (error) {
      console.error("Error deleting user:", error);
      return false;
    }
  };

  // Add admin role via backend
  const addAdminRole = async (userId: string): Promise<boolean> => {
    if (!isAdmin) return false;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const token = session?.access_token;
      if (!token) return false;

      const response = await fetch(`${backendUrl}/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'super_admin' })
      });

      if (!response.ok) return false;

      await fetchUsers();
      return true;
    } catch (error) {
      console.error("Error adding admin role:", error);
      return false;
    }
  };

  // Remove admin role via backend
  const removeAdminRole = async (userId: string): Promise<boolean> => {
    if (!isAdmin) return false;
    if (userId === user?.id) return false;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const token = session?.access_token;
      if (!token) return false;

      const response = await fetch(`${backendUrl}/api/admin/users/${userId}/role`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'super_admin' })
      });

      if (!response.ok) return false;

      await fetchUsers();
      return true;
    } catch (error) {
      console.error("Error removing admin role:", error);
      return false;
    }
  };

  return {
    isAdmin,
    isLoading,
    users,
    companies,
    addAdminRole,
    removeAdminRole,
    deleteCompany,
    deleteUser,
    refreshData: () => {
      fetchUsers();
      fetchCompanies();
    },
  };
}