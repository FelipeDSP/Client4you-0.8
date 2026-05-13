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

    # ... (dentro da classe SupabaseService)

    async def get_agent_config(self, company_id: str) -> Optional[dict]:
        """Busca a configuração do agente da empresa"""
        try:
            response = self.client.table("agent_configs")\
                .select("*")\
                .eq("company_id", company_id)\
                .single()\
                .execute()
            return response.data
        except Exception as e:
            # Se não encontrar (erro da API), retorna None
            # O frontend tratará criando um default
            return None

    async def upsert_agent_config(self, company_id: str, config_data: dict) -> dict:
        """Cria ou atualiza a configuração do agente"""
        try:
            # Remove campos que não devem ser salvos diretamente se existirem
            config_data.pop("id", None)
            config_data.pop("updated_at", None)
            
            # Força o company_id
            config_data["company_id"] = company_id
            config_data["updated_at"] = datetime.now(timezone.utc).isoformat()

            response = self.client.table("agent_configs")\
                .upsert(config_data, on_conflict="company_id")\
                .execute()
            
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Erro ao salvar config do agente: {e}")
            return None
    
    # ========== Waha Configuration (Legacy Support) ==========
    async def get_waha_config(self, company_id: str) -> Optional[Dict[str, Any]]:
        """
        Busca configuração do WAHA - primeiro em company_settings, depois em waha_configs (legado).
        Ignora valor "default" pois isso significa que não foi configurado manualmente.
        """
        try:
            # 1. Primeiro tenta buscar na tabela 'company_settings' (padrão atual)
            result = self.client.table('company_settings')\
                .select('waha_session, waha_api_url, waha_api_key')\
                .eq('company_id', company_id)\
                .limit(1)\
                .execute()
            
            if result.data and result.data[0].get('waha_session'):
                session = result.data[0].get('waha_session')
                # Ignorar "default" - significa que não foi configurado corretamente
                if session and session.lower() != 'default':
                    return {"session_name": session}
            
            # 2. Fallback: Tenta buscar na tabela 'waha_configs' (legado)
            try:
                legacy_result = self.client.table('waha_configs')\
                    .select('session_name')\
                    .eq('company_id', company_id)\
                    .limit(1)\
                    .execute()
                
                if legacy_result.data:
                    session = legacy_result.data[0].get('session_name')
                    if session and session.lower() != 'default':
                        return legacy_result.data[0]
            except Exception:
                # Tabela legada pode não existir
                pass
            
            return None
        except Exception as e:
            logger.warning(f"Note: Could not fetch waha_config: {e}")
            return None

    # ========== Campaigns ==========
    async def create_campaign(self, campaign_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new campaign"""
        result = await asyncio.to_thread(self.client.table('campaigns').insert(campaign_data).execute)
        return result.data[0] if result.data else None
    
    async def get_campaign(self, campaign_id: str) -> Optional[Dict[str, Any]]:
        """Get a campaign by ID"""
        result = await asyncio.to_thread(self.client.table('campaigns').select('*').eq('id', campaign_id).execute)
        return result.data[0] if result.data else None
    
    async def get_campaigns_by_company(self, company_id: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Get all campaigns for a company"""
        result = self.client.table('campaigns')\
            .select('*')\
            .eq('company_id', company_id)\
            .order('created_at', desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()
        return result.data or []
    
    async def update_campaign(self, campaign_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a campaign"""
        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        result = await asyncio.to_thread(self.client.table('campaigns').update(update_data).eq('id', campaign_id).execute)
        return result.data[0] if result.data else None
    
    async def delete_campaign(self, campaign_id: str) -> bool:
        """Delete a campaign"""
        result = await asyncio.to_thread(self.client.table('campaigns').delete().eq('id', campaign_id).execute)
        return len(result.data) > 0 if result.data else False
    
    async def increment_campaign_counter(self, campaign_id: str, field: str, value: int = 1) -> None:
        """Increment a campaign counter atomically (sent_count, error_count, pending_count)"""
        try:
            self.client.rpc('increment_campaign_counter_atomic', {
                'p_campaign_id': campaign_id,
                'p_field': field,
                'p_amount': value,
            }).execute()
        except Exception as rpc_err:
            # Fallback: read-then-write if RPC not yet deployed
            logger.warning(f"RPC increment_campaign_counter_atomic not available, using fallback: {rpc_err}")
            campaign = await self.get_campaign(campaign_id)
            if campaign:
                new_value = (campaign.get(field) or 0) + value
                await self.update_campaign(campaign_id, {field: new_value})
    
    # ========== Contacts ==========
    async def create_contacts(self, contacts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create multiple contacts"""
        if not contacts:
            return []
        import asyncio
        result = await asyncio.to_thread(self.client.table('campaign_contacts').insert(contacts).execute)
        return result.data or []
    
    async def get_contact(self, contact_id: str) -> Optional[Dict[str, Any]]:
        """Get a contact by ID"""
        result = self.client.table('campaign_contacts').select('*').eq('id', contact_id).execute()
        return result.data[0] if result.data else None
    
    async def get_contacts_by_campaign(
        self, 
        campaign_id: str, 
        status: Optional[str] = None,
        limit: int = 100, 
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get contacts for a campaign"""
        query = self.client.table('campaign_contacts')\
            .select('*')\
            .eq('campaign_id', campaign_id)
        
        if status:
            query = query.eq('status', status)
        
        import asyncio
        result = await asyncio.to_thread(query.range(offset, offset + limit - 1).execute)
        return result.data or []
    
    async def get_next_pending_contact(self, campaign_id: str) -> Optional[Dict[str, Any]]:
        """Get next pending contact for a campaign"""
        result = self.client.table('campaign_contacts')\
            .select('*')\
            .eq('campaign_id', campaign_id)\
            .eq('status', 'pending')\
            .limit(1)\
            .execute()
        return result.data[0] if result.data else None
    
    async def update_contact(self, contact_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a contact"""
        result = self.client.table('campaign_contacts').update(update_data).eq('id', contact_id).execute()
        return result.data[0] if result.data else None
    
    async def delete_contacts_by_campaign(self, campaign_id: str) -> int:
        """Delete all contacts for a campaign"""
        result = self.client.table('campaign_contacts').delete().eq('campaign_id', campaign_id).execute()
        return len(result.data) if result.data else 0
    
    async def reset_contacts_status(self, campaign_id: str) -> int:
        """Reset all contacts to pending status"""
        result = self.client.table('campaign_contacts')\
            .update({
                'status': 'pending',
                'error_message': None,
                'sent_at': None
            })\
            .eq('campaign_id', campaign_id)\
            .execute()
        return len(result.data) if result.data else 0
    
    async def count_contacts(self, campaign_id: str, status: Optional[str] = None) -> int:
        """Count contacts for a campaign"""
        query = self.client.table('campaign_contacts')\
            .select('id', count='exact')\
            .eq('campaign_id', campaign_id)
        
        if status:
            query = query.eq('status', status)
        
        result = query.execute()
        return result.count or 0
    
    # ========== Message Logs ==========
    async def create_message_log(self, log_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a message log entry"""
        result = self.client.table('message_logs').insert(log_data).execute()
        return result.data[0] if result.data else None
    
    async def get_message_logs(
        self,
        campaign_id: str,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get message logs for a campaign"""
        query = self.client.table('message_logs')\
            .select('*')\
            .eq('campaign_id', campaign_id)\
            .order('sent_at', desc=True)
        
        if status:
            query = query.eq('status', status)
        
        import asyncio
        result = await asyncio.to_thread(query.range(offset, offset + limit - 1).execute)
        return result.data or []
    
    async def count_message_logs(self, campaign_id: str, status: Optional[str] = None) -> int:
        """Count message logs for a campaign"""
        query = self.client.table('message_logs')\
            .select('id', count='exact')\
            .eq('campaign_id', campaign_id)
        
        if status:
            query = query.eq('status', status)
        
        result = query.execute()
        return result.count or 0
    
    async def delete_message_logs_by_campaign(self, campaign_id: str) -> int:
        """Delete all message logs for a campaign"""
        result = self.client.table('message_logs').delete().eq('campaign_id', campaign_id).execute()
        return len(result.data) if result.data else 0
    
    async def count_messages_sent_today(self, campaign_id: str) -> int:
        """Count messages sent today for a campaign"""
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        
        result = self.client.table('message_logs')\
            .select('id', count='exact')\
            .eq('campaign_id', campaign_id)\
            .eq('status', 'sent')\
            .gte('sent_at', today)\
            .execute()
        
        return result.count or 0
    
    # ========== Dashboard Stats ==========
    async def get_dashboard_stats(self, company_id: str) -> Dict[str, Any]:
        """Get dashboard statistics for a company"""
        # Total leads (count only, no data transfer)
        leads_result = self.client.table('leads')\
            .select('id', count='exact')\
            .eq('company_id', company_id)\
            .execute()
        total_leads = leads_result.count or 0

        # Total campaigns
        campaigns_result = self.client.table('campaigns')\
            .select('id', count='exact')\
            .eq('company_id', company_id)\
            .execute()
        total_campaigns = campaigns_result.count or 0

        # Active campaigns
        active_result = self.client.table('campaigns')\
            .select('id', count='exact')\
            .eq('company_id', company_id)\
            .eq('status', 'running')\
            .execute()
        active_campaigns = active_result.count or 0

        # Total sent messages (sum from campaigns, avoids scanning message_logs)
        campaigns = self.client.table('campaigns')\
            .select('sent_count')\
            .eq('company_id', company_id)\
            .execute()
        total_sent = sum(c.get('sent_count', 0) for c in (campaigns.data or []))

        # Messages sent today (filtered by company campaigns)
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        campaign_ids = [c.get('id') for c in (campaigns.data or []) if c.get('id')]
        messages_today = 0
        if campaign_ids:
            today_result = self.client.table('message_logs')\
                .select('id', count='exact')\
                .in_('campaign_id', campaign_ids)\
                .eq('status', 'sent')\
                .gte('sent_at', today)\
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
            'plan_expires_at': period_end,
            'subscription_status': status,
        }
    
    async def check_quota(self, user_id: str, action: str) -> Dict[str, Any]:
        """
        Check if user can perform action.
        Combina contadores (user_quotas) + plano (subscriptions) + limites (PLAN_LIMITS).
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
            }

            if action not in action_map:
                return {'allowed': True, 'reason': 'OK'}

            limit_field, used_field = action_map[action]
            limit = full_quota.get(limit_field, 0) or 0
            used = full_quota.get(used_field, 0) or 0

            if limit == -1:
                return {'allowed': True, 'reason': 'Ilimitado', 'limit': -1, 'used': used, 'unlimited': True}

            if limit == 0:
                return {'allowed': False, 'reason': 'Recurso não disponível no seu plano', 'limit': 0, 'used': used}

            if used >= limit:
                return {'allowed': False, 'reason': f'Limite atingido ({used}/{limit})', 'limit': limit, 'used': used}

            return {'allowed': True, 'reason': f'OK ({used}/{limit})', 'limit': limit, 'used': used}

        except Exception as e:
            logger.error(f"Error checking quota: {e}")
            # Em caso de erro, permitir para não bloquear o usuário
            return {'allowed': True, 'reason': 'Erro na verificação (permitido por padrão)'}
    
    async def increment_quota(self, user_id: str, action: str, amount: int = 1) -> bool:
        """
        Increment quota usage atomically via RPC (com fallback read-then-write).
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
            }

            used_field = action_map.get(action)
            if not used_field:
                logger.warning(f"Action {action} not mapped for quota increment")
                return True

            # Use atomic RPC function (prevents race conditions)
            try:
                self.client.rpc('increment_quota_atomic', {
                    'p_user_id': user_id,
                    'p_field': used_field,
                    'p_amount': amount,
                }).execute()
                return True
            except Exception as rpc_err:
                # Fallback: direct update if RPC not yet deployed
                logger.warning(f"RPC increment_quota_atomic not available, using fallback: {rpc_err}")
                quota = await self.get_user_quota(user_id)
                if not quota:
                    return False
                current_value = quota.get(used_field, 0) or 0
                new_value = current_value + amount
                self.client.table('user_quotas')\
                    .update({used_field: new_value})\
                    .eq('user_id', user_id)\
                    .execute()
                return True

        except Exception as e:
            logger.error(f"Error incrementing quota: {e}")
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
