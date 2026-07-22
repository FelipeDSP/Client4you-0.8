import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Supabase env vars ausentes: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env (ver .env.example)."
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// ── "Manter logado" ────────────────────────────────────────────────────────
// Marcado (default) → sessão no localStorage: sobrevive ao fechar o navegador.
// Desmarcado        → sessão no sessionStorage: apagada ao fechar a aba/janela
//                     (útil em computador compartilhado).
// A tela de login chama setRememberMe() ANTES do signInWithPassword, então o
// storage abaixo escreve a sessão no lugar certo já no login.
const REMEMBER_ME_KEY = 'auth_remember_me';

export function setRememberMe(remember: boolean): void {
  localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false');
}

function rememberMeEnabled(): boolean {
  // default true = mantém o comportamento de continuar logado
  return localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
}

// Storage que roteia leitura/escrita entre local e session conforme a preferência.
const switchableStorage = {
  getItem: (key: string): string | null =>
    localStorage.getItem(key) ?? sessionStorage.getItem(key),
  setItem: (key: string, value: string): void => {
    if (rememberMeEnabled()) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: switchableStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});