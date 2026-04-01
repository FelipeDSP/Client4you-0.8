import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from security_utils import get_authenticated_user, handle_error
from helpers import get_db

logger = logging.getLogger(__name__)

# Podemos ter dois routers para evitar prefixar manual, ou usar prefixos nos endpoints
router = APIRouter(tags=["dashboard"])

@router.get("/dashboard/stats")
async def get_dashboard_stats(
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        stats = await db.get_dashboard_stats(auth_user["company_id"])
        return stats
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao carregar estatísticas do dashboard")


@router.get("/notifications")
async def get_notifications(
    auth_user: dict = Depends(get_authenticated_user),
    unread_only: bool = False,
    limit: int = 50,
    skip: int = 0
):
    try:
        db = get_db()
        user_id = auth_user["user_id"]
        notifications = await db.get_notifications(user_id=user_id, limit=limit, unread_only=unread_only)
        return {"notifications": notifications}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao buscar notificações")


@router.get("/notifications/unread-count")
async def get_unread_notifications_count(
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        count = await db.get_unread_notification_count(auth_user["user_id"])
        return {"count": count}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao contar notificações não lidas")


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        success = await db.mark_notification_read(notification_id, auth_user["user_id"])
        if not success:
            raise HTTPException(status_code=404, detail="Notificação não encontrada")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao marcar notificação como lida")


@router.put("/notifications/mark-all-read")
async def mark_all_notifications_read(
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        success = await db.mark_all_notifications_read(auth_user["user_id"])
        return {"success": success}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao marcar todas as notificações como lidas")
