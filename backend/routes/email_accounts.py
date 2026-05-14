"""
CRUD de contas SMTP do usuário + endpoint de verify (testa conexão SMTP real).

Cada usuário pode ter múltiplas contas (ex: Gmail pessoal + Outlook do trabalho).
A senha é encriptada com Fernet antes do INSERT e nunca é retornada em GETs.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field
from aiosmtplib import SMTP, SMTPException

from security_utils import get_authenticated_user, handle_error
from helpers import get_db
from encryption import encrypt, decrypt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/email-accounts", tags=["email-accounts"])


# ─── Pydantic models ────────────────────────────────────────────────────────

class EmailAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    from_email: EmailStr
    from_name: Optional[str] = Field(None, max_length=255)
    reply_to: Optional[EmailStr] = None
    smtp_host: str = Field(..., min_length=3, max_length=255)
    smtp_port: int = Field(587, ge=1, le=65535)
    smtp_user: str = Field(..., min_length=1, max_length=255)
    smtp_password: str = Field(..., min_length=1)
    smtp_use_tls: bool = True
    daily_limit: int = Field(100, ge=1, le=10000)


class EmailAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = Field(None, max_length=255)
    reply_to: Optional[EmailStr] = None
    smtp_host: Optional[str] = Field(None, min_length=3, max_length=255)
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    smtp_user: Optional[str] = Field(None, min_length=1, max_length=255)
    smtp_password: Optional[str] = Field(None, min_length=1)  # opcional — só atualiza se enviado
    smtp_use_tls: Optional[bool] = None
    daily_limit: Optional[int] = Field(None, ge=1, le=10000)


class EmailAccountResponse(BaseModel):
    id: UUID
    name: str
    from_email: str
    from_name: Optional[str]
    reply_to: Optional[str]
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_use_tls: bool
    daily_limit: int
    is_verified: bool
    last_verified_at: Optional[datetime]
    last_error: Optional[str]
    created_at: datetime
    updated_at: datetime


class VerifyResult(BaseModel):
    success: bool
    error: Optional[str] = None
    last_verified_at: Optional[datetime] = None


# ─── Helpers ────────────────────────────────────────────────────────────────

def _scrub(row: dict) -> dict:
    """Remove smtp_pass_encrypted antes de devolver pro frontend."""
    row.pop("smtp_pass_encrypted", None)
    return row


def _smtp_tls_args(port: int, use_tls: bool) -> dict:
    """
    Decide TLS strategy baseado na porta + flag do user:
    - 465 → SMTPS (TLS implícito)
    - 587 com use_tls → STARTTLS
    - qualquer outra com use_tls=False → plain (raro, mas suportado)
    """
    if port == 465:
        return {"use_tls": True, "start_tls": False}
    if use_tls:
        return {"use_tls": False, "start_tls": True}
    return {"use_tls": False, "start_tls": False}


async def _test_smtp(host: str, port: int, user: str, password: str, use_tls: bool) -> tuple[bool, Optional[str]]:
    """Faz handshake SMTP completo (connect → login → quit). Retorna (ok, erro)."""
    tls_args = _smtp_tls_args(port, use_tls)
    try:
        smtp = SMTP(hostname=host, port=port, timeout=15.0, **tls_args)
        await smtp.connect()
        await smtp.login(user, password)
        await smtp.quit()
        return True, None
    except SMTPException as e:
        return False, f"SMTP: {e}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[EmailAccountResponse])
async def list_accounts(auth_user: dict = Depends(get_authenticated_user)):
    """Lista as contas SMTP do usuário logado."""
    try:
        db = get_db()
        result = db.client.table("email_accounts")\
            .select("*")\
            .eq("user_id", auth_user["user_id"])\
            .order("created_at", desc=True)\
            .execute()
        return [_scrub(r) for r in (result.data or [])]
    except Exception as e:
        raise handle_error(e, "Erro ao listar contas SMTP")


@router.get("/{account_id}", response_model=EmailAccountResponse)
async def get_account(account_id: UUID, auth_user: dict = Depends(get_authenticated_user)):
    try:
        db = get_db()
        result = db.client.table("email_accounts")\
            .select("*")\
            .eq("id", str(account_id))\
            .eq("user_id", auth_user["user_id"])\
            .maybe_single()\
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Conta SMTP não encontrada")
        return _scrub(result.data)
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao buscar conta SMTP")


@router.post("", response_model=EmailAccountResponse, status_code=201)
async def create_account(
    payload: EmailAccountCreate,
    auth_user: dict = Depends(get_authenticated_user),
):
    """Cria uma nova conta SMTP. A senha é encriptada antes do INSERT."""
    try:
        db = get_db()
        company_id = auth_user.get("company_id")
        if not company_id:
            raise HTTPException(status_code=400, detail="Usuário sem company_id")

        encrypted = encrypt(payload.smtp_password)

        row = {
            "user_id": auth_user["user_id"],
            "company_id": company_id,
            "name": payload.name,
            "from_email": payload.from_email,
            "from_name": payload.from_name,
            "reply_to": payload.reply_to,
            "smtp_host": payload.smtp_host,
            "smtp_port": payload.smtp_port,
            "smtp_user": payload.smtp_user,
            "smtp_pass_encrypted": encrypted,
            "smtp_use_tls": payload.smtp_use_tls,
            "daily_limit": payload.daily_limit,
            "is_verified": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        result = db.client.table("email_accounts").insert(row).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Falha ao criar conta SMTP")

        return _scrub(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        # Erro comum: UNIQUE(user_id, from_email) violation
        msg = str(e)
        if "duplicate key" in msg.lower() or "unique" in msg.lower():
            raise HTTPException(status_code=409, detail="Já existe uma conta com esse from_email")
        raise handle_error(e, "Erro ao criar conta SMTP")


@router.put("/{account_id}", response_model=EmailAccountResponse)
async def update_account(
    account_id: UUID,
    payload: EmailAccountUpdate,
    auth_user: dict = Depends(get_authenticated_user),
):
    """Atualiza campos. Senha só é regravada se vier no payload."""
    try:
        db = get_db()
        # confirma ownership
        existing = db.client.table("email_accounts")\
            .select("id")\
            .eq("id", str(account_id))\
            .eq("user_id", auth_user["user_id"])\
            .maybe_single()\
            .execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Conta SMTP não encontrada")

        update_data = payload.model_dump(exclude_unset=True)
        # encripta senha se enviada
        if "smtp_password" in update_data:
            update_data["smtp_pass_encrypted"] = encrypt(update_data.pop("smtp_password"))
            # Mudar senha → invalida verificação anterior
            update_data["is_verified"] = False
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        result = db.client.table("email_accounts")\
            .update(update_data)\
            .eq("id", str(account_id))\
            .eq("user_id", auth_user["user_id"])\
            .execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Falha ao atualizar")

        return _scrub(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao atualizar conta SMTP")


@router.delete("/{account_id}")
async def delete_account(
    account_id: UUID,
    auth_user: dict = Depends(get_authenticated_user),
):
    """
    Deleta uma conta SMTP. Falha se houver campanhas usando essa conta
    (ON DELETE RESTRICT no FK de email_campaigns.email_account_id).
    """
    try:
        db = get_db()
        result = db.client.table("email_accounts")\
            .delete()\
            .eq("id", str(account_id))\
            .eq("user_id", auth_user["user_id"])\
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Conta SMTP não encontrada")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        if "foreign key" in msg.lower() or "violates" in msg.lower():
            raise HTTPException(
                status_code=409,
                detail="Não dá pra deletar: existem campanhas usando essa conta SMTP",
            )
        raise handle_error(e, "Erro ao deletar conta SMTP")


@router.post("/{account_id}/verify", response_model=VerifyResult)
async def verify_account(
    account_id: UUID,
    auth_user: dict = Depends(get_authenticated_user),
):
    """
    Testa a conexão SMTP (connect + login + quit). Atualiza is_verified +
    last_verified_at + last_error.
    """
    try:
        db = get_db()
        result = db.client.table("email_accounts")\
            .select("*")\
            .eq("id", str(account_id))\
            .eq("user_id", auth_user["user_id"])\
            .maybe_single()\
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Conta SMTP não encontrada")

        account = result.data
        password = decrypt(account["smtp_pass_encrypted"])
        if not password:
            raise HTTPException(
                status_code=500,
                detail="Senha SMTP não pôde ser decriptada. ENCRYPTION_KEY mudou? Atualize a senha.",
            )

        ok, error = await _test_smtp(
            host=account["smtp_host"],
            port=account["smtp_port"],
            user=account["smtp_user"],
            password=password,
            use_tls=account["smtp_use_tls"],
        )

        now_iso = datetime.now(timezone.utc).isoformat()
        update_data = {
            "is_verified": ok,
            "last_verified_at": now_iso if ok else None,
            "last_error": None if ok else error,
            "updated_at": now_iso,
        }
        db.client.table("email_accounts")\
            .update(update_data)\
            .eq("id", str(account_id))\
            .execute()

        return VerifyResult(
            success=ok,
            error=error,
            last_verified_at=datetime.now(timezone.utc) if ok else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "Erro ao verificar conta SMTP")
