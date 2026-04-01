// Lead type - compatible with both mock data and database
export interface Lead {
  id: string;
  name: string;
  phone: string;
  hasWhatsApp: boolean;
  email: string | null;
  hasEmail?: boolean;
  address: string;
  city: string;
  state: string;
  rating: number;
  reviews: number;
  category: string;
  website: string | null;
  extractedAt: string;
  searchId?: string;
  companyId?: string;
  
  // Nova arquitetura v2 - Deduplicação e rastreamento
  fingerprint?: string;
  timesSeen?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  isFavorite?: boolean;
  tags?: string[];
  isDuplicate?: boolean; // Temporário - usado apenas em resultados de busca
}

export interface SearchHistory {
  id: string;
  query: string;
  location: string;
  resultsCount: number;
  searchedAt: string;
  userId?: string;
  companyId?: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  companyId: string | null;
  role?: string;
  // Backwards compatible getters
  name?: string;
  company?: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRole {
  id: string;
  userId: string;
  role: 'super_admin' | 'company_owner' | 'admin' | 'member';
  companyId: string | null;
}

export interface Subscription {
  id: string;
  companyId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'expired';
  demoUsed: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}
