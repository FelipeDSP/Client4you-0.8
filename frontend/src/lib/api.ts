/**
 * Utilitário centralizado para requisições autenticadas ao backend.
 * Inclui:
 * - Token JWT de autenticação
 * - Session Token para verificação de sessão única
 * - Tratamento automático de sessão expirada em outro dispositivo
 */

import { supabase } from "@/integrations/supabase/client";

const SESSION_TOKEN_KEY = 'app_session_token';

// Callback para quando a sessão expira (será setado pelo AuthProvider)
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredCallback(callback: () => void) {
  onSessionExpired = callback;
}

/**
 * Faz requisição autenticada ao backend
 * Inclui automaticamente:
 * - Authorization: Bearer {jwt_token}
 * - X-Session-Token: {session_token}
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error("Error getting session:", error);
      throw new Error("Erro ao obter sessão. Tente fazer login novamente.");
    }
    
    if (!session?.access_token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    
    // Obter session token para verificação de sessão única
    const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);
    
    const headers: HeadersInit = {
      ...options.headers,
      "Authorization": `Bearer ${session.access_token}`,
    };
    
    // Adicionar session token se existir
    if (sessionToken) {
      headers["X-Session-Token"] = sessionToken;
    }
    
    // Só adiciona Content-Type para requisições que não são FormData
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    // Verificar se a sessão foi invalidada por outro dispositivo
    if (response.status === 401) {
      const data = await response.clone().json().catch(() => ({}));
      if (data.detail === "SESSION_EXPIRED_OTHER_DEVICE") {
        console.log("[API] Sessão expirada - outro dispositivo logou");
        if (onSessionExpired) {
          onSessionExpired();
        }
        throw new Error("Sua conta foi acessada em outro dispositivo.");
      }
    }
    
    return response;
  } catch (error: any) {
    console.error("makeAuthenticatedRequest error:", error);
    throw error;
  }
}

/**
 * Helper para GET requests
 */
export async function apiGet(url: string): Promise<Response> {
  return makeAuthenticatedRequest(url, { method: "GET" });
}

/**
 * Helper para POST requests
 */
export async function apiPost(url: string, body?: any): Promise<Response> {
  const options: RequestInit = { method: "POST" };
  if (body) {
    options.body = body instanceof FormData ? body : JSON.stringify(body);
  }
  return makeAuthenticatedRequest(url, options);
}

/**
 * Helper para PUT requests
 */
export async function apiPut(url: string, body?: any): Promise<Response> {
  const options: RequestInit = { method: "PUT" };
  if (body) {
    options.body = JSON.stringify(body);
  }
  return makeAuthenticatedRequest(url, options);
}

/**
 * Helper para DELETE requests
 */
export async function apiDelete(url: string): Promise<Response> {
  return makeAuthenticatedRequest(url, { method: "DELETE" });
}
