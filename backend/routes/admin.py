"""
Admin endpoints - Gerenciamento de usuários
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional
import logging
from datetime import datetime, timedelta, timezone
from security_utils import get_authenticated_user, require_role, handle_error
from supabase_service import get_supabase_service
from audit_service import get_audit_service
from plans import PLAN_LIMITS, get_plan_limits

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


class DeleteUserRequest(BaseModel):
    user_id: str


class CleanupOrphansResponse(BaseModel):
    orphans_found: int
    orphans_deleted: int
    orphan_emails: list[str]


class SuspendUserRequest(BaseModel):
    reason: Optional[str] = "Suspenso pelo administrador"


class ActivateUserRequest(BaseModel):
    plan_type: str = "basico"
    plan_name: str = "Plano Básico"
    days_valid: int = 30


@admin_router.post("/users/{user_id}/suspend")
async def suspend_user_account(
    request: Request,
    user_id: str,
    suspend_data: SuspendUserRequest,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Suspende a conta de um usuário (bloqueia acesso a todas as funcionalidades)
    
    IMPORTANTE: Requer role super_admin
    """
    try:
        # Prevenir auto-suspensão
        if user_id == auth_user["user_id"]:
            raise HTTPException(
                status_code=400,
                detail="Você não pode suspender sua própria conta"
            )
        
        db = get_supabase_service()
        audit = get_audit_service()
        
        # Buscar dados do usuário
        profile = db.client.table('profiles')\
            .select('email')\
            .eq('id', user_id)\
            .single()\
            .execute()
        
        if not profile.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
        target_email = profile.data.get('email')

        # Suspende a subscription da empresa do usuário (status='suspended')
        company_id = db.client.table('profiles')\
            .select('company_id')\
            .eq('id', user_id)\
            .maybe_single()\
            .execute().data.get('company_id')
        if company_id:
            db.client.table('subscriptions')\
                .update({
                    'status': 'suspended',
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                })\
                .eq('company_id', company_id)\
                .execute()
        
        # Log de auditoria
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='user_suspended',
            target_type='user',
            target_id=user_id,
            target_email=target_email,
            details={'reason': suspend_data.reason},
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )
        
        logger.info(f"Admin {auth_user['email']} suspendeu usuário {target_email}")
        
        return {
            "success": True,
            "message": f"Conta de {target_email} suspensa com sucesso",
            "user_id": user_id,
            "status": "suspended"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao suspender usuário: {e}")
        raise handle_error(e, "Erro ao suspender")


@admin_router.post("/users/{user_id}/activate")
async def activate_user_account(
    request: Request,
    user_id: str,
    activate_data: ActivateUserRequest,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Ativa/reativa a conta de um usuário com um plano específico
    
    IMPORTANTE: Requer role super_admin
    """
    try:
        db = get_supabase_service()
        audit = get_audit_service()
        
        # Buscar dados do usuário
        profile = db.client.table('profiles')\
            .select('email, company_id')\
            .eq('id', user_id)\
            .single()\
            .execute()
        
        if not profile.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
        target_email = profile.data.get('email')
        company_id = profile.data.get('company_id')

        if not company_id:
            raise HTTPException(status_code=400, detail="Usuário sem company_id — não dá pra ativar")

        # Validar plano contra PLAN_LIMITS canônico
        valid_plans = ['demo', 'basico', 'intermediario']
        plan_type = activate_data.plan_type.lower()
        if plan_type not in valid_plans:
            raise HTTPException(
                status_code=400,
                detail=f"Plano inválido. Use: {', '.join(valid_plans)}"
            )

        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(days=activate_data.days_valid)).isoformat()

        # Subscription (plano por company)
        db.client.table('subscriptions').upsert({
            'company_id': company_id,
            'plan_id': plan_type,
            'status': 'active',
            'current_period_start': now.isoformat(),
            'current_period_end': expires_at,
            'updated_at': now.isoformat(),
        }, on_conflict='company_id').execute()

        # user_quotas: garante que existe (não zera contadores se já existe)
        existing_q = db.client.table('user_quotas')\
            .select('id')\
            .eq('user_id', user_id)\
            .maybe_single()\
            .execute()
        if not (existing_q and existing_q.data):
            db.client.table('user_quotas').insert({
                'user_id': user_id,
                'company_id': company_id,
                'leads_used': 0,
                'campaigns_used': 0,
                'messages_sent': 0,
                'updated_at': now.isoformat(),
            }).execute()
        else:
            db.client.table('user_quotas')\
                .update({'company_id': company_id, 'updated_at': now.isoformat()})\
                .eq('user_id', user_id)\
                .execute()

        # Log de auditoria
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='user_activated',
            target_type='user',
            target_id=user_id,
            target_email=target_email,
            details={
                'plan_type': plan_type,
                'plan_name': activate_data.plan_name,
                'expires_at': expires_at
            },
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )
        
        logger.info(f"Admin {auth_user['email']} ativou usuário {target_email} com plano {plan_type}")
        
        return {
            "success": True,
            "message": f"Conta de {target_email} ativada com plano {activate_data.plan_name}",
            "user_id": user_id,
            "plan_type": plan_type,
            "expires_at": expires_at
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao ativar usuário: {e}")
        raise handle_error(e, "Erro ao ativar")


@admin_router.get("/users")
async def list_all_users(
    request: Request,
    auth_user: dict = Depends(require_role("super_admin")),
    limit: int = 50,
    offset: int = 0,
    search: str = None
):
    """
    Lista todos os usuários com seus planos e status paginado e auditado
    
    IMPORTANTE: Requer role super_admin
    """
    try:
        import asyncio
        db = get_supabase_service()
        audit = get_audit_service()

        # 1) Busca profiles (sem embed pra evitar ambiguidade de FK do PostgREST)
        query = db.client.table('profiles').select(
            'id, email, full_name, company_id, created_at', count='exact'
        )
        if search:
            query = query.ilike('email', f'%{search}%')

        profiles_result = await asyncio.to_thread(
            query.order('created_at', desc=True).range(offset, offset + limit - 1).execute
        )
        profiles = profiles_result.data or []
        profile_ids = [p['id'] for p in profiles]
        company_ids = list({p['company_id'] for p in profiles if p.get('company_id')})

        # 2) Busca companies em lote
        companies_map: dict = {}
        if company_ids:
            companies_result = await asyncio.to_thread(
                db.client.table('companies').select('id, name').in_('id', company_ids).execute
            )
            companies_map = {c['id']: c for c in (companies_result.data or [])}

        # 3) Busca user_roles em lote (multiplas roles por user → lista)
        roles_map: dict[str, list] = {}
        if profile_ids:
            roles_result = await asyncio.to_thread(
                db.client.table('user_roles').select('user_id, role').in_('user_id', profile_ids).execute
            )
            for r in (roles_result.data or []):
                roles_map.setdefault(r['user_id'], []).append(r['role'])

        # 4) Busca subscriptions em lote (fonte do plano)
        subs_map: dict = {}
        if company_ids:
            subs_result = await asyncio.to_thread(
                db.client.table('subscriptions')
                  .select('company_id, plan_id, status, current_period_end')
                  .in_('company_id', company_ids).execute
            )
            subs_map = {s['company_id']: s for s in (subs_result.data or [])}

        # 5) Monta a resposta
        users = []
        for profile in profiles:
            company_id = profile.get('company_id')
            sub = subs_map.get(company_id, {}) if company_id else {}
            plan_id = sub.get('plan_id') or 'demo'
            sub_status = sub.get('status') or 'expired'
            plan_name = PLAN_LIMITS.get(plan_id, {}).get('name', 'Sem Plano')
            company = companies_map.get(company_id, {}) if company_id else {}

            users.append({
                'id': profile['id'],
                'email': profile['email'],
                'full_name': profile.get('full_name'),
                'company_id': company_id,
                'company_name': company.get('name'),
                'roles': roles_map.get(profile['id'], []),
                'plan_type': plan_id,
                'plan_name': plan_name,
                'status': sub_status,
                'expires_at': sub.get('current_period_end'),
                'created_at': profile['created_at']
            })

        # 6) Audit log (em try/except próprio — falha aqui não derruba a resposta)
        try:
            await audit.log_action(
                user_id=auth_user['user_id'],
                user_email=auth_user['email'],
                action='view_users_list',
                target_type='system',
                target_id=None,
                target_email=None,
                details={'offset': offset, 'limit': limit, 'search': search},
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get('user-agent')
            )
        except Exception as audit_err:
            logger.warning(f"audit.log_action falhou (não-crítico): {audit_err}")

        return {
            'users': users,
            'total': profiles_result.count or len(users),
            'limit': limit,
            'offset': offset
        }

    except Exception as e:
        logger.error(f"Erro ao listar usuários: {e}", exc_info=True)
        raise handle_error(e, "Erro ao listar")




@admin_router.get("/orphan-users")
async def get_orphan_users(
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Lista usuários órfãos (existem em auth.users mas não em profiles)
    
    IMPORTANTE: Requer role super_admin
    """
    try:
        db = get_supabase_service()
        
        # Buscar todos os usuários do Auth
        auth_response = db.client.auth.admin.list_users()
        auth_users = auth_response if isinstance(auth_response, list) else []
        
        # Buscar todos os IDs de profiles
        profiles_result = db.client.table('profiles').select('id').execute()
        profile_ids = set([p['id'] for p in profiles_result.data]) if profiles_result.data else set()
        
        # Encontrar órfãos
        orphans = []
        for user in auth_users:
            user_id = user.id if hasattr(user, 'id') else user.get('id')
            email = user.email if hasattr(user, 'email') else user.get('email')
            created_at = user.created_at if hasattr(user, 'created_at') else user.get('created_at')
            
            if user_id not in profile_ids:
                orphans.append({
                    'id': user_id,
                    'email': email,
                    'created_at': created_at
                })
        
        logger.info(f"Admin {auth_user['email']} listou {len(orphans)} usuários órfãos")
        
        return {
            'total_auth_users': len(auth_users),
            'total_profiles': len(profile_ids),
            'orphans_found': len(orphans),
            'orphans': orphans
        }
        
    except Exception as e:
        logger.error(f"Erro ao listar usuários órfãos: {e}")
        raise handle_error(e, "Erro ao listar órfãos")


@admin_router.delete("/orphan-users")
async def cleanup_orphan_users(
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Remove todos os usuários órfãos (existem em auth.users mas não em profiles)
    
    ATENÇÃO: Ação irreversível!
    IMPORTANTE: Requer role super_admin
    """
    try:
        db = get_supabase_service()
        
        # Buscar órfãos (mesmo código do endpoint GET)
        auth_response = db.client.auth.admin.list_users()
        auth_users = auth_response if isinstance(auth_response, list) else []
        
        profiles_result = db.client.table('profiles').select('id').execute()
        profile_ids = set([p['id'] for p in profiles_result.data]) if profiles_result.data else set()
        
        orphans = []
        for user in auth_users:
            user_id = user.id if hasattr(user, 'id') else user.get('id')
            email = user.email if hasattr(user, 'email') else user.get('email')
            
            if user_id not in profile_ids:
                orphans.append({'id': user_id, 'email': email})
        
        if not orphans:
            return {
                'success': True,
                'message': 'Nenhum usuário órfão encontrado',
                'orphans_deleted': 0,
                'orphan_emails': []
            }
        
        # Deletar órfãos
        deleted_count = 0
        deleted_emails = []
        failed = []
        
        for orphan in orphans:
            try:
                db.client.auth.admin.delete_user(orphan['id'])
                deleted_count += 1
                deleted_emails.append(orphan['email'])
                logger.info(f"✅ Órfão deletado: {orphan['email']} (ID: {orphan['id']})")
            except Exception as e:
                failed.append({'email': orphan['email'], 'error': str(e)})
                logger.error(f"❌ Erro ao deletar órfão {orphan['email']}: {e}")
        
        logger.warning(f"Admin {auth_user['email']} deletou {deleted_count} usuários órfãos")
        
        return {
            'success': True,
            'message': f'{deleted_count} usuário(s) órfão(s) deletado(s)',
            'orphans_found': len(orphans),
            'orphans_deleted': deleted_count,
            'orphan_emails': deleted_emails,
            'failed': failed if failed else None
        }
        
    except Exception as e:
        logger.error(f"Erro ao limpar usuários órfãos: {e}")
        raise handle_error(e, "Erro na limpeza")


class UpdateQuotaRequest(BaseModel):
    plan_type: str
    plan_name: str
    leads_limit: int
    campaigns_limit: int
    messages_limit: int


@admin_router.get("/users/{user_id}/quota")
async def get_user_quota(
    user_id: str,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Busca quota combinada de um usuário (admin only).
    Retorna user_quotas (contadores) + subscription da empresa + limites.
    """
    try:
        db = get_supabase_service()
        combined = await db.get_user_quota_with_plan(user_id)
        if not combined:
            return {
                'user_id': user_id,
                'plan_type': 'demo',
                'plan_name': 'Demo',
                'leads_limit': 0,
                'campaigns_limit': 0,
                'messages_limit': 0,
                'leads_used': 0,
                'campaigns_used': 0,
                'messages_sent': 0,
                'subscription_status': 'expired',
            }

        logger.info(f"Admin {auth_user['email']} consultou quota de {user_id}")
        return combined

    except Exception as e:
        logger.error(f"Erro ao buscar quota: {e}")
        return {
            'user_id': user_id,
            'plan_type': 'demo',
            'plan_name': 'Demo',
            'leads_limit': 0,
            'campaigns_limit': 0,
            'messages_limit': 0,
        }


@admin_router.post("/users/{user_id}/quota")
async def update_user_quota(
    request: Request,
    user_id: str,
    quota_data: UpdateQuotaRequest,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Atualiza quota de um usuário (admin only)
    
    IMPORTANTE: Requer role super_admin
    """
    try:
        db = get_supabase_service()
        audit = get_audit_service()
        
        # Buscar user_id para pegar company_id e email
        profile = db.client.table('profiles')\
            .select('company_id, email')\
            .eq('id', user_id)\
            .single()\
            .execute()
        
        if not profile.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
        company_id = profile.data.get('company_id')
        target_email = profile.data.get('email')

        if not company_id:
            raise HTTPException(status_code=400, detail="Usuário sem company_id")

        # Plano vai pra subscriptions; user_quotas mantém só contadores.
        # Os campos leads_limit/campaigns_limit/messages_limit do request
        # agora são IGNORADOS — limites vêm de plans.PLAN_LIMITS via plan_id.
        now = datetime.now(timezone.utc)
        db.client.table('subscriptions').upsert({
            'company_id': company_id,
            'plan_id': quota_data.plan_type,
            'status': 'active',
            'current_period_start': now.isoformat(),
            'current_period_end': (now + timedelta(days=30)).isoformat(),
            'updated_at': now.isoformat(),
        }, on_conflict='company_id').execute()

        # Garante user_quotas: insere zerado SÓ se não existir (preserva contadores)
        existing_q = db.client.table('user_quotas')\
            .select('id')\
            .eq('user_id', user_id)\
            .maybe_single()\
            .execute()
        if not (existing_q and existing_q.data):
            result = db.client.table('user_quotas').insert({
                'user_id': user_id,
                'company_id': company_id,
                'leads_used': 0,
                'campaigns_used': 0,
                'messages_sent': 0,
                'updated_at': now.isoformat(),
            }).execute()
        else:
            result = db.client.table('user_quotas')\
                .update({'company_id': company_id, 'updated_at': now.isoformat()})\
                .eq('user_id', user_id)\
                .execute()

        quota_dict = {
            'user_id': user_id,
            'company_id': company_id,
            'plan_type': quota_data.plan_type,
            'plan_name': quota_data.plan_name,
        }
        
        # LOG DE AUDITORIA
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='quota_updated',
            target_type='quota',
            target_id=user_id,
            target_email=target_email,
            details={
                'plan_type': quota_data.plan_type,
                'plan_name': quota_data.plan_name,
                'leads_limit': quota_data.leads_limit,
                'campaigns_limit': quota_data.campaigns_limit,
                'messages_limit': quota_data.messages_limit
            },
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )
        
        logger.info(f"Admin {auth_user['email']} atualizou quota de {user_id} para {quota_data.plan_type}")
        
        return {
            'success': True,
            'message': 'Quota atualizada com sucesso',
            'quota': result.data[0] if result.data else quota_dict
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao atualizar quota: {e}")
        raise handle_error(e, "Erro ao atualizar quota")


@admin_router.delete("/users/{user_id}")
async def delete_user_completely(
    request: Request,
    user_id: str,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Deleta completamente um usuário do sistema
    - Remove de auth.users (Supabase Auth)
    - Remove de profiles
    - Remove de user_roles
    - Remove de user_quotas
    - Remove todas as dependências
    
    IMPORTANTE: Requer role super_admin
    """
    try:
        # Prevenir auto-deleção
        if user_id == auth_user["user_id"]:
            raise HTTPException(
                status_code=400,
                detail="Você não pode deletar sua própria conta de admin"
            )
        
        db = get_supabase_service()
        audit = get_audit_service()
        
        # 1. Buscar dados do usuário antes de deletar (com maybe_single para evitar erro se não existir)
        user_profile = db.client.table('profiles')\
            .select('email, company_id')\
            .eq('id', user_id)\
            .maybe_single()\
            .execute()
        
        # Se profile não existe, verificar se usuário existe no auth
        if not user_profile.data:
            # Tentar buscar direto no auth
            try:
                auth_user_data = db.client.auth.admin.get_user_by_id(user_id)
                if auth_user_data and auth_user_data.user:
                    user_email = auth_user_data.user.email
                    company_id = None
                else:
                    raise HTTPException(status_code=404, detail="Usuário não encontrado no sistema")
            except Exception:
                raise HTTPException(status_code=404, detail="Usuário não encontrado")
        else:
            user_email = user_profile.data.get('email')
            company_id = user_profile.data.get('company_id')
        
        logger.info(f"Admin {auth_user['email']} iniciando deleção de usuário {user_email} (ID: {user_id})")
        
        # 2. Deletar user_quotas
        try:
            db.client.table('user_quotas').delete().eq('user_id', user_id).execute()
            logger.info(f"✅ user_quotas deletado para {user_id}")
        except Exception as e:
            logger.warning(f"Erro ao deletar user_quotas: {e}")
        
        # 3. Deletar user_roles
        try:
            db.client.table('user_roles').delete().eq('user_id', user_id).execute()
            logger.info(f"✅ user_roles deletado para {user_id}")
        except Exception as e:
            logger.warning(f"Erro ao deletar user_roles: {e}")
        
        # Leads pertencem à EMPRESA, não ao usuário. Não há FK user→leads,
        # então nada a deletar aqui. Se for o último membro da empresa, o admin
        # deve usar delete_company para fazer cleanup completo.

        # Deletar histórico de busca
        try:
            db.client.table('search_history').delete().eq('user_id', user_id).execute()
            logger.info(f"✅ Histórico de busca deletado para {user_id}")
        except Exception as e:
            logger.warning(f"Erro ao deletar search_history: {e}")
        
        # 7. Deletar notificações
        try:
            db.client.table('notifications').delete().eq('user_id', user_id).execute()
            logger.info(f"✅ Notificações deletadas para {user_id}")
        except Exception as e:
            logger.warning(f"Erro ao deletar notificações: {e}")

        # 7b. Email cleanup (campanhas ANTES de contas — FK email_account_id é RESTRICT)
        try:
            db.client.table('email_campaigns').delete().eq('user_id', user_id).execute()
            db.client.table('email_accounts').delete().eq('user_id', user_id).execute()
            logger.info(f"✅ Email accounts/campaigns deletados para {user_id}")
        except Exception as e:
            logger.warning(f"Erro ao deletar email_* do user: {e}")

        # 8. Deletar profile
        db.client.table('profiles').delete().eq('id', user_id).execute()
        logger.info(f"✅ Profile deletado para {user_id}")
        
        # 9. CRÍTICO: Deletar da tabela auth.users usando admin API
        try:
            # Usar service_role para deletar usuário do Auth
            response = db.client.auth.admin.delete_user(user_id)
            logger.info(f"✅ Usuário deletado do Supabase Auth: {user_id}")
        except Exception as e:
            error_msg = str(e)
            # Se o usuário não foi encontrado ou já foi deletado, considerar sucesso
            if "not found" in error_msg.lower() or "user not allowed" in error_msg.lower():
                logger.warning(f"⚠️ Usuário já removido do auth ou sem permissão: {user_id}")
            else:
                logger.error(f"❌ ERRO ao deletar do auth.users: {e}")
                # Não levantar exceção, pois já deletamos do banco
        
        # LOG DE AUDITORIA
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='user_deleted',
            target_type='user',
            target_id=user_id,
            target_email=user_email,
            details={
                'company_id': company_id
            },
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )
        
        logger.info(f"✅ DELEÇÃO COMPLETA: Usuário {user_email} (ID: {user_id}) totalmente removido")
        
        return {
            "success": True,
            "message": f"Usuário {user_email} deletado completamente do sistema",
            "user_id": user_id,
            "email": user_email
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao deletar usuário {user_id}: {e}")
        raise handle_error(e, "Erro ao deletar usuário")


@admin_router.get("/companies")
async def list_all_companies(
    request: Request,
    auth_user: dict = Depends(require_role("super_admin")),
    limit: int = 50,
    offset: int = 0,
    search: str = None
):
    try:
        db = get_supabase_service()
        audit = get_audit_service()
        
        query = db.client.table('companies')\
            .select('id, name, slug, created_at, subscriptions(plan_id, status, demo_used), company_member_counts(total_members)', count='exact')
            
        if search:
            query = query.ilike('name', f'%{search}%')
            
        import asyncio
        companies_result = await asyncio.to_thread(query.order('created_at', desc=True).range(offset, offset + limit - 1).execute)
            
        companies = []
        for c in (companies_result.data or []):
            subs = c.get('subscriptions') or []
            sub = subs[0] if isinstance(subs, list) and len(subs) > 0 else (subs if isinstance(subs, dict) else {})
            
            members = c.get('company_member_counts') or []
            member_count = members[0].get('total_members', 0) if isinstance(members, list) and len(members)>0 else 0
            
            companies.append({
                'id': c['id'],
                'name': c['name'],
                'slug': c['slug'],
                'createdAt': c['created_at'],
                'membersCount': member_count,
                'subscription': {
                    'planId': sub.get('plan_id'),
                    'status': sub.get('status'),
                    'demoUsed': sub.get('demo_used', False)
                } if sub else None
            })
            
        # Log de Auditoria
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='view_companies_list',
            target_type='system',
            target_id=None,
            target_email=None,
            details={'offset': offset, 'limit': limit, 'search': search},
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )
            
        return {
            'companies': companies,
            'total': companies_result.count or len(companies),
            'limit': limit,
            'offset': offset
        }
    except Exception as e:
        logger.error(f"Erro ao listar empresas: {e}")
        raise handle_error(e, "Erro ao listar empresas")


# ========== DELETE COMPANY ==========

@admin_router.delete("/companies/{company_id}")
async def delete_company(
    request: Request,
    company_id: str,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Deleta uma empresa e TODOS os dados relacionados (transacional via service_role).
    Inclui: leads, search_history, notifications, company_settings,
    subscriptions, user_quotas, user_roles, profiles, e a empresa em si.
    """
    try:
        import asyncio
        db = get_supabase_service()
        audit = get_audit_service()
        client = db.client

        # 1. Buscar company name para audit log
        company_result = await asyncio.to_thread(
            client.table('companies').select('name').eq('id', company_id).execute
        )
        company_name = company_result.data[0]['name'] if company_result.data else 'Unknown'

        # 2. Buscar user IDs para limpar roles e quotas
        profiles_result = await asyncio.to_thread(
            client.table('profiles').select('id').eq('company_id', company_id).execute
        )
        user_ids = [p['id'] for p in (profiles_result.data or [])]

        # 3. Email cleanup — ordem importa pelos FKs (sem CASCADE no schema):
        #    email_events → email_campaign_recipients → email_campaigns → email_accounts
        try:
            # Pegar todos campaign_ids da company para limpar events/recipients
            camps_res = await asyncio.to_thread(
                client.table('email_campaigns').select('id').eq('company_id', company_id).execute
            )
            campaign_ids = [c['id'] for c in (camps_res.data or [])]
            if campaign_ids:
                await asyncio.to_thread(
                    client.table('email_events').delete().in_('campaign_id', campaign_ids).execute
                )
                await asyncio.to_thread(
                    client.table('email_campaign_recipients').delete().in_('campaign_id', campaign_ids).execute
                )
            await asyncio.to_thread(
                client.table('email_campaigns').delete().eq('company_id', company_id).execute
            )
            await asyncio.to_thread(
                client.table('email_accounts').delete().eq('company_id', company_id).execute
            )
        except Exception as e:
            logger.warning(f"Erro ao limpar email_* da company {company_id}: {e}")

        # 4. Deletar dados na ordem correta (respeitando FKs)
        tables_to_clean = [
            'leads', 'search_history', 'notifications',
            'company_settings', 'subscriptions', 'ip_whitelist'
        ]
        for table in tables_to_clean:
            try:
                await asyncio.to_thread(
                    client.table(table).delete().eq('company_id', company_id).execute
                )
            except Exception:
                pass  # Ignora se tabela não existe ou já está vazia
        
        # 5. Limpar user-specific data
        if user_ids:
            for uid in user_ids:
                try:
                    await asyncio.to_thread(
                        client.table('user_quotas').delete().eq('user_id', uid).execute
                    )
                except Exception:
                    pass
                try:
                    await asyncio.to_thread(
                        client.table('user_roles').delete().eq('user_id', uid).execute
                    )
                except Exception:
                    pass
            
            # Delete profiles
            await asyncio.to_thread(
                client.table('profiles').delete().eq('company_id', company_id).execute
            )
        
        # 6. Deletar a empresa
        await asyncio.to_thread(
            client.table('companies').delete().eq('id', company_id).execute
        )
        
        # Audit log
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='delete_company',
            target_type='company',
            target_id=company_id,
            target_email=None,
            details={
                'company_name': company_name,
                'users_affected': len(user_ids),
            },
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )

        logger.info(f"✅ Empresa {company_name} ({company_id}) deletada por {auth_user['email']}")
        return {
            "success": True,
            "message": f"Empresa {company_name} e todos os dados deletados",
            "details": {
                "users_removed": len(user_ids),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao deletar empresa {company_id}: {e}")
        raise handle_error(e, "Erro ao deletar empresa")


# ========== ROLE MANAGEMENT ==========

class RoleRequest(BaseModel):
    role: str = "super_admin"


@admin_router.post("/users/{user_id}/role")
async def add_user_role(
    request: Request,
    user_id: str,
    role_data: RoleRequest,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """Adiciona um role a um usuário"""
    try:
        import asyncio
        db = get_supabase_service()
        audit = get_audit_service()
        
        # Buscar email do target user
        user_result = await asyncio.to_thread(
            db.client.table('profiles').select('email').eq('id', user_id).execute
        )
        target_email = user_result.data[0]['email'] if user_result.data else None
        
        # Inserir role
        await asyncio.to_thread(
            db.client.table('user_roles').insert({
                'user_id': user_id,
                'role': role_data.role
            }).execute
        )
        
        # Audit log
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='add_role',
            target_type='user',
            target_id=user_id,
            target_email=target_email,
            details={'role': role_data.role},
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )
        
        logger.info(f"✅ Role {role_data.role} adicionado a {target_email} por {auth_user['email']}")
        return {"success": True, "message": f"Role {role_data.role} adicionado"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao adicionar role: {e}")
        raise handle_error(e, "Erro ao adicionar role")


@admin_router.delete("/users/{user_id}/role")
async def remove_user_role(
    request: Request,
    user_id: str,
    role_data: RoleRequest,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """Remove um role de um usuário (não permite auto-remoção de super_admin)"""
    try:
        import asyncio
        db = get_supabase_service()
        audit = get_audit_service()
        
        # Prevenção de auto-remoção
        if user_id == auth_user['user_id'] and role_data.role == 'super_admin':
            raise HTTPException(status_code=403, detail="Não é possível remover seu próprio role de super_admin")
        
        # Buscar email do target user
        user_result = await asyncio.to_thread(
            db.client.table('profiles').select('email').eq('id', user_id).execute
        )
        target_email = user_result.data[0]['email'] if user_result.data else None
        
        # Remover role
        await asyncio.to_thread(
            db.client.table('user_roles').delete()
            .eq('user_id', user_id)
            .eq('role', role_data.role)
            .execute
        )
        
        # Audit log
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='remove_role',
            target_type='user',
            target_id=user_id,
            target_email=target_email,
            details={'role': role_data.role},
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )
        
        logger.info(f"✅ Role {role_data.role} removido de {target_email} por {auth_user['email']}")
        return {"success": True, "message": f"Role {role_data.role} removido"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao remover role: {e}")
        raise handle_error(e, "Erro ao remover role")


# ========== CREATE USER ==========

class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    plan_type: str = "intermediario"
    plan_name: str = "Intermediário"


@admin_router.post("/users")
async def create_user(
    request: Request,
    user_data: CreateUserRequest,
    auth_user: dict = Depends(require_role("super_admin"))
):
    """
    Cria um novo usuário via Supabase Admin API (server-side).
    Cria: auth user → profile (via trigger) → quota
    """
    try:
        import asyncio
        db = get_supabase_service()
        audit = get_audit_service()
        
        # 1. Criar usuário via Admin API (service_role)
        create_result = db.client.auth.admin.create_user({
            "email": user_data.email,
            "password": user_data.password,
            "email_confirm": True,
            "user_metadata": {
                "full_name": user_data.full_name or ""
            }
        })
        
        if not create_result or not create_result.user:
            raise HTTPException(status_code=400, detail="Falha ao criar usuário no Supabase Auth")
        
        new_user_id = create_result.user.id
        
        # 2. Aguarda trigger criar profile + company
        import time
        await asyncio.to_thread(time.sleep, 2)
        
        # 3. Busca company_id do profile criado pelo trigger
        profile_result = await asyncio.to_thread(
            db.client.table('profiles').select('company_id').eq('id', str(new_user_id)).execute
        )
        company_id = profile_result.data[0].get('company_id') if profile_result.data else None
        
        # 4. Criar subscription (plano) + user_quotas (contadores)
        now = datetime.now(timezone.utc)
        if company_id:
            await asyncio.to_thread(
                db.client.table('subscriptions').upsert({
                    'company_id': company_id,
                    'plan_id': user_data.plan_type,
                    'status': 'active',
                    'current_period_start': now.isoformat(),
                    'current_period_end': (now + timedelta(days=30)).isoformat(),
                    'updated_at': now.isoformat(),
                }, on_conflict='company_id').execute
            )

        await asyncio.to_thread(
            db.client.table('user_quotas').upsert({
                'user_id': str(new_user_id),
                'company_id': company_id,
                'leads_used': 0,
                'campaigns_used': 0,
                'messages_sent': 0,
                'updated_at': now.isoformat(),
            }, on_conflict='user_id').execute
        )
        
        # Audit log
        await audit.log_action(
            user_id=auth_user['user_id'],
            user_email=auth_user['email'],
            action='create_user',
            target_type='user',
            target_id=str(new_user_id),
            target_email=user_data.email,
            details={
                'plan_type': user_data.plan_type,
                'full_name': user_data.full_name
            },
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent')
        )
        
        logger.info(f"✅ Usuário {user_data.email} criado por {auth_user['email']}")
        return {
            "success": True,
            "user_id": str(new_user_id),
            "email": user_data.email,
            "plan_type": user_data.plan_type
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao criar usuário: {e}")
        raise handle_error(e, "Erro ao criar usuário")

