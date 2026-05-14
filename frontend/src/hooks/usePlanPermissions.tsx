import { useMemo } from "react";
import { useQuotas } from "./useQuotas";

export type PlanType = 'basico' | 'intermediario' | 'suspended';

export interface PlanPermissions {
  // Funcionalidades
  canSearchLeads: boolean;
  canExportLeads: boolean;

  // Limites
  leadsLimit: number; // -1 = ilimitado

  // Status
  planType: PlanType;
  planName: string;
  isPlanExpired: boolean;
  isSuspended: boolean;
  isActive: boolean;
  expiresAt: string | null;
  daysUntilExpiration: number | null;
}

// Configuração de permissões por plano
const PLAN_PERMISSIONS: Record<PlanType, Omit<PlanPermissions, 'isPlanExpired' | 'isSuspended' | 'isActive' | 'expiresAt' | 'daysUntilExpiration' | 'planName'>> = {
  basico: {
    canSearchLeads: true,
    canExportLeads: true,
    leadsLimit: -1,
    planType: 'basico',
  },
  intermediario: {
    canSearchLeads: true,
    canExportLeads: true,
    leadsLimit: -1,
    planType: 'intermediario',
  },
  suspended: {
    canSearchLeads: false,
    canExportLeads: false,
    leadsLimit: 0,
    planType: 'suspended',
  },
};

export function usePlanPermissions() {
  const { quota, isLoading, error, refresh } = useQuotas();

  const permissions = useMemo<PlanPermissions>(() => {
    // Valores default para quando não tem quota (conta sem plano = suspensa)
    if (!quota) {
      return {
        ...PLAN_PERMISSIONS.suspended,
        planName: 'Sem Plano',
        isPlanExpired: false,
        isSuspended: true,
        isActive: false,
        expiresAt: null,
        daysUntilExpiration: null,
      };
    }

    const planType = (quota.plan_type?.toLowerCase() || 'basico') as PlanType;
    
    // Verificar se conta está suspensa (usando plan_type como marcador)
    const isSuspended = planType === 'suspended';
    
    if (isSuspended) {
      return {
        ...PLAN_PERMISSIONS.suspended,
        planName: 'Conta Suspensa',
        isPlanExpired: false,
        isSuspended: true,
        isActive: false,
        expiresAt: quota.plan_expires_at || null,
        daysUntilExpiration: null,
      };
    }

    // Se o plano for 'demo', tratar como suspenso (plano não existe mais)
    if (planType === 'demo' as any) {
      return {
        ...PLAN_PERMISSIONS.suspended,
        planName: 'Plano Inativo',
        isPlanExpired: true,
        isSuspended: false,
        isActive: false,
        expiresAt: quota.plan_expires_at || null,
        daysUntilExpiration: null,
      };
    }
    
    const basePlan = PLAN_PERMISSIONS[planType] || PLAN_PERMISSIONS.basico;
    
    // Calcular expiração
    const expiresAt = quota.plan_expires_at || null;
    let isPlanExpired = false;
    let daysUntilExpiration: number | null = null;

    if (expiresAt) {
      const expirationDate = new Date(expiresAt);
      const now = new Date();
      isPlanExpired = expirationDate < now;
      
      if (!isPlanExpired) {
        const diffTime = expirationDate.getTime() - now.getTime();
        daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
    }

    // Se o plano expirou, bloqueia TUDO
    if (isPlanExpired) {
      return {
        ...PLAN_PERMISSIONS.suspended,
        planType,
        planName: quota.plan_name || 'Expirado',
        isPlanExpired: true,
        isSuspended: false,
        isActive: false,
        expiresAt,
        daysUntilExpiration: 0,
      };
    }

    return {
      ...basePlan,
      planName: quota.plan_name || basePlan.planType,
      isPlanExpired,
      isSuspended: false,
      isActive: true,
      expiresAt,
      daysUntilExpiration,
    };
  }, [quota]);

  return {
    permissions,
    isLoading,
    error,
    refresh,
    // Atalhos úteis
    canUseFeature: (feature: 'leads') => {
      if (permissions.isPlanExpired || permissions.isSuspended) return false;
      switch (feature) {
        case 'leads': return permissions.canSearchLeads;
        default: return false;
      }
    },
  };
}
