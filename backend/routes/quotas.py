import logging
from fastapi import APIRouter, HTTPException, Depends
from security_utils import get_authenticated_user, handle_error
from helpers import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quotas", tags=["quotas"])

@router.get("/me")
async def get_my_quota(auth_user: dict = Depends(get_authenticated_user)):
    try:
        db = get_db()
        quota = await db.get_user_quota(auth_user["user_id"])
        if not quota:
            raise HTTPException(status_code=404, detail="Quota não encontrada")
        return quota
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao buscar quota")


@router.post("/check")
async def check_quota_endpoint(
    action: str,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        result = await db.check_quota(auth_user["user_id"], action)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao verificar quota")


@router.post("/increment")
async def increment_quota_endpoint(
    action: str,
    amount: int = 1,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        success = await db.increment_quota(auth_user["user_id"], action, amount)
        return {"success": success}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao incrementar quota")
