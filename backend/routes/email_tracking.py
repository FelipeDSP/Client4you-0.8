"""
Endpoints PÚBLICOS de tracking (sem autenticação):
  - GET /api/t/o/{token}.png  — pixel de open
  - GET /api/t/c/{token}      — proxy de click (302 redirect)
  - GET /api/u/{token}        — página de unsubscribe (GET = formulário)
  - POST /api/u/{token}       — confirma unsubscribe

Tokens são identifiers opacos gerados via secrets.token_urlsafe() em
email_worker.gen_tracking_token() e armazenados em
email_campaign_recipients.tracking_token.

Tudo escreve via service_role (bypass RLS) já que o backend usa essa chave.
"""
import base64
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import Response, RedirectResponse, HTMLResponse

from helpers import get_db

logger = logging.getLogger(__name__)
router = APIRouter(tags=["email-tracking"])


# Pixel 1x1 transparente GIF — menor que PNG, universal
PIXEL_GIF = base64.b64decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)

# Pixel 1x1 transparente PNG (~70 bytes, melhor compat com clientes que filtram GIF)
PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIA"
    "AAUAAen63NgAAAAASUVORK5CYII="
)


def _get_recipient_by_token(db, token: str) -> Optional[dict]:
    try:
        result = db.client.table("email_campaign_recipients")\
            .select("*")\
            .eq("tracking_token", token)\
            .maybe_single()\
            .execute()
        return result.data
    except Exception as e:
        logger.error(f"Erro ao buscar recipient por token: {e}")
        return None


def _client_meta(request: Request) -> tuple[str, str]:
    """Extrai user-agent e IP do request."""
    ua = request.headers.get("user-agent", "")[:500]
    # Prefere X-Forwarded-For (atrás de Coolify/Cloudflare)
    fwd = request.headers.get("x-forwarded-for", "")
    ip = (fwd.split(",")[0].strip() if fwd else None) or (
        request.client.host if request.client else "unknown"
    )
    return ua, ip


# ─── Open tracking ─────────────────────────────────────────────────────────

@router.get("/t/o/{token}.png")
async def track_open(token: str, request: Request):
    """
    Pixel 1x1 chamado pelo `<img>` injetado no email pelo worker.
    Sempre retorna 200 com o pixel — mesmo se o token for inválido,
    pra não denunciar a existência ou não do recipient.
    """
    try:
        db = get_db()
        recipient = _get_recipient_by_token(db, token)
        if recipient:
            ua, ip = _client_meta(request)
            now_iso = datetime.now(timezone.utc).isoformat()

            db.client.table("email_events").insert({
                "recipient_id": recipient["id"],
                "campaign_id": recipient["campaign_id"],
                "event_type": "opened",
                "user_agent": ua,
                "ip_address": ip,
                "occurred_at": now_iso,
            }).execute()

            # Atualiza recipient
            update_data = {
                "last_opened_at": now_iso,
                "open_count": (recipient.get("open_count") or 0) + 1,
            }
            if not recipient.get("first_opened_at"):
                update_data["first_opened_at"] = now_iso
                # Só promove status pra 'opened' se ainda era 'sent'
                if recipient.get("status") == "sent":
                    update_data["status"] = "opened"

                # Incrementa opened_count na campaign (apenas no primeiro open)
                _increment_campaign(db, recipient["campaign_id"], "opened_count")

            db.client.table("email_campaign_recipients")\
                .update(update_data)\
                .eq("id", recipient["id"])\
                .execute()
    except Exception as e:
        logger.warning(f"track_open erro (não-crítico): {e}")

    return Response(
        content=PIXEL_PNG,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


# ─── Click tracking ────────────────────────────────────────────────────────

@router.get("/t/c/{token}")
async def track_click(token: str, request: Request, u: Optional[str] = None):
    """
    Proxy de click. Registra evento e redireciona pra URL original.
    Se URL não vier ou for inválida, manda pra dashboard.
    """
    target = u or "/"
    # Segurança mínima: só aceita http/https
    if not (target.startswith("http://") or target.startswith("https://") or target.startswith("/")):
        target = "/"

    try:
        db = get_db()
        recipient = _get_recipient_by_token(db, token)
        if recipient:
            ua, ip = _client_meta(request)
            now_iso = datetime.now(timezone.utc).isoformat()

            db.client.table("email_events").insert({
                "recipient_id": recipient["id"],
                "campaign_id": recipient["campaign_id"],
                "event_type": "clicked",
                "user_agent": ua,
                "ip_address": ip,
                "link_url": target,
                "occurred_at": now_iso,
            }).execute()

            update_data = {
                "last_clicked_at": now_iso,
                "click_count": (recipient.get("click_count") or 0) + 1,
            }
            if not recipient.get("first_clicked_at"):
                update_data["first_clicked_at"] = now_iso
                # Promove status (clicked > opened > sent)
                if recipient.get("status") in ("sent", "opened"):
                    update_data["status"] = "clicked"
                _increment_campaign(db, recipient["campaign_id"], "clicked_count")

            db.client.table("email_campaign_recipients")\
                .update(update_data)\
                .eq("id", recipient["id"])\
                .execute()
    except Exception as e:
        logger.warning(f"track_click erro (não-crítico): {e}")

    return RedirectResponse(url=target, status_code=302)


# ─── Unsubscribe ───────────────────────────────────────────────────────────

UNSUBSCRIBE_PAGE = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cancelar inscrição</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;
               background: #f5f5f5; margin: 0; padding: 40px 20px;
               display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card { background: white; border-radius: 8px; padding: 40px;
                max-width: 480px; width: 100%;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; }
        h1 { margin: 0 0 16px; color: #1f2937; font-size: 24px; }
        p { color: #6b7280; line-height: 1.5; margin: 0 0 24px; }
        .btn { background: #ef4444; color: white; border: none; border-radius: 6px;
               padding: 12px 24px; font-size: 16px; cursor: pointer; font-weight: 500; }
        .btn:hover { background: #dc2626; }
        .btn-secondary { background: transparent; color: #6b7280; padding: 12px 24px;
                         cursor: pointer; font-size: 14px; }
        .ok { color: #16a34a; font-weight: 500; }
        .err { color: #dc2626; font-weight: 500; }
    </style>
</head>
<body>
    <div class="card">
        __CONTENT__
    </div>
</body>
</html>"""


def _render_page(content_html: str) -> str:
    return UNSUBSCRIBE_PAGE.replace("__CONTENT__", content_html)


@router.get("/u/{token}", response_class=HTMLResponse)
async def unsubscribe_page(token: str):
    """Página de confirmação de unsubscribe."""
    db = get_db()
    recipient = _get_recipient_by_token(db, token)
    if not recipient:
        return HTMLResponse(_render_page(
            '<h1>Link inválido</h1>'
            '<p class="err">Esse link de cancelamento não foi encontrado ou já foi processado.</p>'
        ))

    if recipient.get("status") == "unsubscribed":
        return HTMLResponse(_render_page(
            '<h1>Você já cancelou</h1>'
            '<p class="ok">Não vamos mais enviar emails para este endereço.</p>'
        ))

    email = recipient.get("email", "")
    return HTMLResponse(_render_page(f"""
        <h1>Cancelar inscrição?</h1>
        <p>Você está cancelando o recebimento de emails neste endereço:<br>
        <strong>{email}</strong></p>
        <form method="post" action="/api/u/{token}">
            <button type="submit" class="btn">Confirmar cancelamento</button>
        </form>
    """))


@router.post("/u/{token}", response_class=HTMLResponse)
async def unsubscribe_confirm(token: str, request: Request):
    """Processa o opt-out."""
    db = get_db()
    recipient = _get_recipient_by_token(db, token)
    if not recipient:
        raise HTTPException(status_code=404, detail="Token inválido")

    now_iso = datetime.now(timezone.utc).isoformat()
    ua, ip = _client_meta(request)

    db.client.table("email_campaign_recipients").update({
        "status": "unsubscribed",
        "unsubscribed_at": now_iso,
    }).eq("id", recipient["id"]).execute()

    db.client.table("email_events").insert({
        "recipient_id": recipient["id"],
        "campaign_id": recipient["campaign_id"],
        "event_type": "unsubscribed",
        "user_agent": ua,
        "ip_address": ip,
        "occurred_at": now_iso,
    }).execute()

    _increment_campaign(db, recipient["campaign_id"], "unsubscribed_count")

    return HTMLResponse(_render_page(
        '<h1>Pronto!</h1>'
        '<p class="ok">Não vamos mais enviar emails para você. '
        'Se mudar de ideia, fale com quem te enviou esta mensagem.</p>'
    ))


# ─── Helper ─────────────────────────────────────────────────────────────────

def _increment_campaign(db, campaign_id: str, field: str, amount: int = 1) -> None:
    """Increment não-atômico (read-then-write). Aceitável pra MVP."""
    try:
        result = db.client.table("email_campaigns")\
            .select(field)\
            .eq("id", campaign_id)\
            .maybe_single()\
            .execute()
        current = (result.data.get(field) if result.data else 0) or 0
        db.client.table("email_campaigns")\
            .update({field: current + amount})\
            .eq("id", campaign_id)\
            .execute()
    except Exception as e:
        logger.error(f"Erro ao incrementar {field}: {e}")
