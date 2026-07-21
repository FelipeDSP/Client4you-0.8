"""
Supabase Database Service
Handles all database operations using Supabase REST API
"""
import os
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from supabase import create_client, Client
import logging
import asyncio

logger = logging.getLogger(__name__)


class SupabaseService:
    
    def __init__(self):
        self.url = os.environ.get('SUPABASE_URL')
        # Use service_role key for backend operations (has full access)
        self.key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')
        
        if not self.url or not self.key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) must be set")
        
        self.client: Client = create_client(self.url, self.key)

    # ========== Dashboard Stats ==========
    async def get_dashboard_stats(self, company_id: str) -> Dict[str, Any]:
        """Estatísticas do dashboard — agregado de email campaigns."""
        # Total leads
        leads_result = self.client.table('leads')\
            .select('id', count='exact')\
            .eq('company_id', company_id)\
            .execute()
        total_leads = leads_result.count or 0

        # Total + active email campaigns
        campaigns_result = self.client.table('email_campaigns')\
            .select('id, sent_count, opened_count, clicked_count', count='exact')\
            .eq('company_id', company_id)\
            .execute()
        total_campaigns = campaigns_result.count or 0
        campaigns_data = campaigns_result.data or []
        total_sent = sum(c.get('sent_count', 0) for c in campaigns_data)

        active_result = self.client.table('email_campaigns')\
            .select('id', count='exact')\
            .eq('company_id', company_id)\
            .eq('status', 'sending')\
            .execute()
        active_campaigns = active_result.count or 0

        # Emails enviados hoje (via email_events filtrado pelos campaign_ids dessa empresa)
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        campaign_ids = [c['id'] for c in campaigns_data if c.get('id')]
        messages_today = 0
        if campaign_ids:
            today_result = self.client.table('email_events')\
                .select('id', count='exact')\
                .in_('campaign_id', campaign_ids)\
                .eq('event_type', 'sent')\
                .gte('occurred_at', today)\
                .execute()
            messages_today = today_result.count or 0

        return {
            "total_leads": total_leads,
            "total_campaigns": total_campaigns,
            "active_campaigns": active_campaigns,
            "total_messages_sent": total_sent,
            "messages_sent_today": messages_today
        }
    
    # ========== Notifications ==========
    async def get_notifications(self, user_id: str, limit: int = 50, unread_only: bool = False) -> List[Dict[str, Any]]:
        """Get user notifications"""
        query = self.client.table('notifications')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('created_at', desc=True)\
            .limit(limit)
        
        if unread_only:
            query = query.eq('read', False)
        
        result = query.execute()
        return result.data or []
    
    async def get_unread_notification_count(self, user_id: str) -> int:
        """Get unread notification count"""
        result = self.client.table('notifications')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .eq('read', False)\
            .execute()
        return result.count or 0
    
    async def mark_notification_read(self, notification_id: str, user_id: str) -> bool:
        """Mark notification as read"""
        try:
            result = self.client.table('notifications')\
                .update({'read': True, 'read_at': datetime.now(timezone.utc).isoformat()})\
                .eq('id', notification_id)\
                .eq('user_id', user_id)\
                .execute()
            return len(result.data) > 0 if result.data else False
        except Exception as e:
            logger.error(f"Error marking notification as read: {e}")
            return False
    
    async def mark_all_notifications_read(self, user_id: str) -> bool:
        """Mark all notifications as read"""
        try:
            result = self.client.table('notifications')\
                .update({'read': True, 'read_at': datetime.now(timezone.utc).isoformat()})\
                .eq('user_id', user_id)\
                .eq('read', False)\
                .execute()
            return True
        except Exception as e:
            logger.error(f"Error marking all notifications as read: {e}")
            return False
    
    async def create_notification(
        self, 
        user_id: str, 
        company_id: str, 
        notification_type: str, 
        title: str, 
        message: str, 
        link: Optional[str] = None, 
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """Create a notification"""
        try:
            notification_data = {
                'user_id': user_id,
                'company_id': company_id,
                'type': notification_type,
                'title': title,
                'message': message,
                'link': link,
                'metadata': metadata,
                'read': False
            }
            result = self.client.table('notifications').insert(notification_data).execute()
            return result.data[0]['id'] if result.data else None
        except Exception as e:
            logger.error(f"Error creating notification: {e}")
            return None
    
    # ========== Quotas / Subscriptions ==========
    async def get_user_quota(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Retorna apenas o registro de user_quotas (contadores: leads_used,
        campaigns_used, messages_sent, reset_date). Para shape combinada com
        plano, use get_user_quota_with_plan.
        """
        try:
            result = self.client.table('user_quotas')\
                .select('*')\
                .eq('user_id', user_id)\
                .maybe_single()\
                .execute()
            return result.data
        except Exception as e:
            logger.error(f"Error getting user quota: {e}")
            return None

    async def get_company_subscription(self, company_id: str) -> Optional[Dict[str, Any]]:
        """Retorna a subscription da empresa (plan_id, status, period)."""
        try:
            result = self.client.table('subscriptions')\
                .select('*')\
                .eq('company_id', company_id)\
                .maybe_single()\
                .execute()
            return result.data
        except Exception as e:
            logger.error(f"Error getting company subscription: {e}")
            return None

    async def get_user_quota_with_plan(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Retorna user_quota (contadores) combinado com a subscription da empresa
        e os limites do plano (de plans.PLAN_LIMITS). Shape mantida compatível
        com o que o frontend espera (plan_type, leads_limit, plan_expires_at).
        """
        from plans import get_plan_limits

        quota = await self.get_user_quota(user_id)
        if not quota:
            return None

        company_id = quota.get('company_id')
        subscription = None
        if company_id:
            subscription = await self.get_company_subscription(company_id)

        plan_id = (subscription.get('plan_id') if subscription else None) or 'demo'
        status = (subscription.get('status') if subscription else None) or 'expired'
        period_end = subscription.get('current_period_end') if subscription else None

        limits = get_plan_limits(plan_id, status)

        return {
            **quota,
            'plan_type': plan_id,
            'plan_name': limits['name'],
            'leads_limit': limits['leads_limit'],
            'campaigns_limit': limits['campaigns_limit'],
            'messages_limit': limits['messages_limit'],
            # PR 6: limites de enrichment (vêm de PLAN_LIMITS, contadores em user_quotas)
            'email_enrichment_limit': limits.get('email_enrichment_limit', 0),
            'reenrich_limit': limits.get('reenrich_limit', 0),
            'plan_expires_at': period_end,
            'subscription_status': status,
        }
    
    async def check_quota(self, user_id: str, action: str, requested: int = 1) -> Dict[str, Any]:
        """
        Check if user can perform action.
        Combina contadores (user_quotas) + plano (subscriptions) + limites (PLAN_LIMITS).

        Args:
            user_id: id do usuário
            action: alias da ação ('lead_search', 'email_enrich', 'reenrich', ...)
            requested: quantidade que será consumida na operação. Default 1
                preserva semântica antiga pra callers single-shot. Endpoints de
                batch (enrich-emails síncrono e async, search com depth) DEVEM
                passar o tamanho real do batch — senão usuário com 499/500 pode
                disparar lote de 1000 e burlar o limite numa request só.
                (Achado P0 #2 da auditoria pós-PR 6.)
        """
        try:
            full_quota = await self.get_user_quota_with_plan(user_id)

            if not full_quota:
                return {'allowed': False, 'reason': 'Quota não encontrada'}

            # Subscription suspended/cancelled/expired bloqueia tudo
            sub_status = full_quota.get('subscription_status')
            if sub_status in ('suspended', 'cancelled', 'expired'):
                return {'allowed': False, 'reason': f'Conta {sub_status}'}

            # Mapear ação → (campo de limite, campo de uso).
            # Aceita aliases do frontend (lead_search, campaign_send, message_send).
            action_map = {
                'create_campaign': ('campaigns_limit', 'campaigns_used'),
                'send_message':    ('messages_limit',  'messages_sent'),
                'search_leads':    ('leads_limit',     'leads_used'),
                'start_campaign':  ('campaigns_limit', 'campaigns_used'),
                'lead_search':     ('leads_limit',     'leads_used'),
                'campaign_send':   ('campaigns_limit', 'campaigns_used'),
                'message_send':    ('messages_limit',  'messages_sent'),
                # PR 6: enrichment de email (cache hit OU miss conta)
                'email_enrich':    ('email_enrichment_limit', 'emails_enriched_used'),
                # PR 6: reenriquecimento força bypass cache, contador separado
                'reenrich':        ('reenrich_limit', 'reenrich_used'),
            }

            if action not in action_map:
                return {'allowed': True, 'reason': 'OK'}

            limit_field, used_field = action_map[action]
            limit = full_quota.get(limit_field, 0) or 0
            used = full_quota.get(used_field, 0) or 0
            requested = max(1, int(requested))  # robustez contra 0/negativo

            if limit == -1:
                return {
                    'allowed': True, 'reason': 'Ilimitado',
                    'limit': -1, 'used': used, 'requested': requested, 'unlimited': True,
                }

            if limit == 0:
                return {
                    'allowed': False, 'reason': 'Recurso não disponível no seu plano',
                    'limit': 0, 'used': used, 'requested': requested,
                }

            # Compara `used + requested` em vez de só `used`.
            # Antes: usuário 499/500 podia mandar batch de 1000 leads, passar
            # o check (used < limit) e processar tudo. Agora bloqueia: 499+1000>500.
            if used + requested > limit:
                remaining = max(0, limit - used)
                return {
                    'allowed': False,
                    'reason': f'Limite atingido ({used}/{limit}). Solicitou {requested}, restam {remaining}.',
                    'limit': limit, 'used': used, 'requested': requested, 'remaining': remaining,
                }

            return {
                'allowed': True, 'reason': f'OK ({used}+{requested}/{limit})',
                'limit': limit, 'used': used, 'requested': requested,
            }

        except Exception as e:
            logger.error(f"Error checking quota: {e}")
            # Em caso de erro, permitir para não bloquear o usuário
            return {'allowed': True, 'reason': 'Erro na verificação (permitido por padrão)'}
    
    async def increment_quota(self, user_id: str, action: str, amount: int = 1) -> bool:
        """
        Increment quota usage atomically via RPC `increment_quota_atomic`
        (migration v14). RPC roda UPDATE direto no Postgres, imune a race
        entre workers/requests concorrentes.

        Fallback read-then-write existe pra cobrir janela de deploy onde o
        código novo subiu antes da migration. Em condição normal o RPC
        funciona; fallback dispara ERROR no log pra alertar.

        Atenção: campo de mensagens é `messages_sent`, não `messages_used`.
        """
        try:
            action_map = {
                'create_campaign': 'campaigns_used',
                'send_message':    'messages_sent',
                'search_leads':    'leads_used',
                'start_campaign':  'campaigns_used',
                'lead_search':     'leads_used',
                'campaign_send':   'campaigns_used',
                'message_send':    'messages_sent',
                # PR 6: enrichment de email
                'email_enrich':    'emails_enriched_used',
                'reenrich':        'reenrich_used',
            }

            used_field = action_map.get(action)
            if not used_field:
                logger.warning(f"Action {action} not mapped for quota increment")
                return True

            return self._increment_atomic(user_id, used_field, amount)

        except Exception as e:
            logger.error(f"Error incrementing quota: {e}")
            return False

    def _increment_atomic(self, user_id: str, field: str, amount) -> bool:
        """RPC atômico em user_quotas.{field}. Fallback NÃO-atômico se RPC ausente.

        Helper público pra services/email_enrichment/persistence.py incrementar
        múltiplos campos (emails_enriched_used + firecrawl_credits + cache_hits)
        sem replicar o try/except do fallback.
        """
        try:
            self.client.rpc('increment_quota_atomic', {
                'p_user_id': user_id,
                'p_field': field,
                'p_amount': amount,
            }).execute()
            return True
        except Exception as rpc_err:
            # Migration v14 ainda não aplicada → cai no read-then-write.
            # ERROR (não warning) pra ficar visível no log do Coolify até
            # alguém aplicar a migration.
            logger.error(
                f"RPC increment_quota_atomic falhou ({rpc_err}) — usando fallback "
                f"NÃO-ATÔMICO em {field}. Aplique docs/migrations/migration_v14_quota_atomic.sql."
            )
            try:
                resp = (
                    self.client.table('user_quotas')
                    .select(field)
                    .eq('user_id', user_id)
                    .limit(1)
                    .execute()
                )
                rows = resp.data or []
                if not rows:
                    return False
                current = rows[0].get(field) or 0
                self.client.table('user_quotas').update({
                    field: current + amount,
                }).eq('user_id', user_id).execute()
                return True
            except Exception as fallback_err:
                logger.error(f"Fallback de increment também falhou: {fallback_err}")
                return False
    
    async def upgrade_plan(self, user_id: str, plan_type: str, plan_name: str = None) -> bool:
        """
        Upgrade do plano da empresa do usuário (UPSERT em subscriptions).
        O parâmetro plan_name é aceito mas ignorado (nome vem de plans.PLAN_LIMITS).
        """
        try:
            from datetime import timedelta
            # Resolve company_id do usuário
            profile = self.client.table('profiles')\
                .select('company_id')\
                .eq('id', user_id)\
                .maybe_single()\
                .execute()
            if not profile.data or not profile.data.get('company_id'):
                logger.error(f"Usuário {user_id} sem company_id — upgrade_plan abortado")
                return False
            company_id = profile.data['company_id']

            now = datetime.now(timezone.utc)
            valid_until = (now + timedelta(days=30)).isoformat()

            self.client.table('subscriptions').upsert({
                'company_id': company_id,
                'plan_id': plan_type,
                'status': 'active',
                'current_period_start': now.isoformat(),
                'current_period_end': valid_until,
                'updated_at': now.isoformat(),
            }, on_conflict='company_id').execute()
            return True
        except Exception as e:
            logger.error(f"Error upgrading plan: {e}")
            return False
    
    # ========== Company Settings ==========
    async def get_company_settings(self, company_id: str) -> Optional[Dict[str, Any]]:
        """Get company settings including SERP API key"""
        try:
            result = self.client.table('company_settings')\
                .select('*')\
                .eq('company_id', company_id)\
                .maybe_single()\
                .execute()
            
            return result.data if result.data else None
        except Exception as e:
            logger.error(f"Error fetching company settings: {e}")
            return None

    # ========== NOVO MÉTODO PARA TIMEZONE ==========
    async def get_company_settings_with_timezone(self, company_id: str) -> Dict[str, Any]:
        """
        Busca configurações da empresa incluindo o timezone da tabela 'companies'.
        Retorna um dicionário com keys seguras.
        """
        try:
            # Busca timezone na tabela companies
            company_result = self.client.table('companies')\
                .select('timezone')\
                .eq('id', company_id)\
                .limit(1)\
                .execute()
            
            timezone = "America/Sao_Paulo"
            if company_result.data:
                timezone = company_result.data[0].get('timezone', "America/Sao_Paulo")
            
            return {"timezone": timezone}
        except Exception as e:
            logger.error(f"Error fetching company timezone: {e}")
            return {"timezone": "America/Sao_Paulo"}


# Global instance
_supabase_service: Optional[SupabaseService] = None


def get_supabase_service() -> SupabaseService:
    """Get or create Supabase service instance"""
    global _supabase_service
    if _supabase_service is None:
        _supabase_service = SupabaseService()
    return _supabase_service
