"""
Async worker que processa recipients pendentes de uma campanha de email.

NÃO é production-grade — roda single-process via FastAPI BackgroundTasks.
Se o uvicorn reiniciar no meio de uma campanha, o envio para. Mas como os
recipients ficam no banco com status='pending', basta chamar /send de novo
e o worker retoma de onde parou.

Pra produção real com volumes maiores, migrar pra Celery + Redis.
"""
import asyncio
import logging
import re
import secrets
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Optional, Tuple
from urllib.parse import quote

from aiosmtplib import SMTP, SMTPException
from jinja2 import Template, TemplateError

from encryption import decrypt
from helpers import get_db

logger = logging.getLogger(__name__)

# Set em memória — evita disparar 2 workers do mesmo campaign_id em paralelo
_running_campaigns: set = set()


# ─── Helpers ────────────────────────────────────────────────────────────────

def _smtp_tls_args(port: int, use_tls: bool) -> dict:
    if port == 465:
        return {"use_tls": True, "start_tls": False}
    if use_tls:
        return {"use_tls": False, "start_tls": True}
    return {"use_tls": False, "start_tls": False}


def _render_template(template_str: str, vars: dict) -> str:
    """Renderiza Jinja2. Se falhar, devolve o template raw (não quebra envio)."""
    if not template_str:
        return ""
    try:
        return Template(template_str).render(**(vars or {}))
    except TemplateError as e:
        logger.warning(f"Template error: {e}")
        return template_str


def gen_tracking_token() -> str:
    """Token URL-safe ~32 chars pra pixel/click/unsubscribe."""
    return secrets.token_urlsafe(24)


def _add_tracking_pixel(html: str, token: str, base_url: str) -> str:
    """Injeta pixel 1x1 antes de </body>. Se não tiver, append."""
    pixel = (
        f'<img src="{base_url}/api/t/o/{token}.png" '
        f'width="1" height="1" border="0" alt="" '
        f'style="display:block;border:0;width:1px;height:1px;" />'
    )
    if re.search(r"</body>", html, flags=re.IGNORECASE):
        return re.sub(r"</body>", f"{pixel}</body>", html, count=1, flags=re.IGNORECASE)
    return html + pixel


def _rewrite_links(html: str, token: str, base_url: str) -> str:
    """
    Reescreve href="..." pra passar pelo proxy de click tracking.
    Mantém mailto:/tel:/anchors intactos.
    """
    def replace(m):
        prefix, original, suffix = m.group(1), m.group(2), m.group(3)
        # não reescreve protocolos especiais nem nossos próprios endpoints
        if (
            original.startswith(("mailto:", "tel:", "#"))
            or f"/api/t/" in original
            or f"/api/u/" in original
        ):
            return m.group(0)
        encoded = quote(original, safe="")
        proxy = f"{base_url}/api/t/c/{token}?u={encoded}"
        return f"{prefix}{proxy}{suffix}"

    pattern = re.compile(r'(href=["\'])([^"\']+)(["\'])', re.IGNORECASE)
    return pattern.sub(replace, html)


def _add_unsubscribe_footer(html: str, token: str, base_url: str) -> str:
    """Adiciona link de unsubscribe (obrigatório por CAN-SPAM/LGPD)."""
    footer = (
        '<div style="margin-top:30px;padding-top:15px;'
        'border-top:1px solid #ccc;font-size:11px;color:#888;text-align:center;">'
        f'<a href="{base_url}/api/u/{token}" style="color:#888;">'
        'Cancelar inscrição</a></div>'
    )
    if re.search(r"</body>", html, flags=re.IGNORECASE):
        return re.sub(r"</body>", f"{footer}</body>", html, count=1, flags=re.IGNORECASE)
    return html + footer


def _is_hard_bounce(error: str) -> bool:
    """
    Detecta bounce duro pela mensagem de erro do SMTP. Heurística simples:
    5xx códigos são permanentes; o resto pode ser temporário.
    """
    if not error:
        return False
    lower = error.lower()
    return any(c in error[:30] for c in ("5.0.", "5.1.", "5.2.", "5.4.", "5.5.", "5.6.", "5.7.")) \
        or "no such user" in lower or "user unknown" in lower \
        or "address rejected" in lower or "not exist" in lower


# ─── Send individual ────────────────────────────────────────────────────────

async def _send_one(account: dict, recipient: dict, campaign: dict, base_url: str) -> Tuple[bool, Optional[str]]:
    """Envia 1 email com tracking injetado. Retorna (ok, erro)."""
    password = decrypt(account["smtp_pass_encrypted"])
    if not password:
        return False, "Falha ao decriptar senha SMTP (ENCRYPTION_KEY mudou?)"

    # Variáveis de template
    template_vars = dict(recipient.get("template_vars") or {})
    template_vars.setdefault("nome", recipient.get("name") or "")
    template_vars.setdefault("email", recipient.get("email") or "")

    # Renderiza assunto e body
    subject = _render_template(campaign["subject"], template_vars)
    body_html = _render_template(campaign["body_html"] or "", template_vars)
    body_text = _render_template(campaign.get("body_text") or "", template_vars)

    # Injeta tracking
    token = recipient["tracking_token"]
    body_html = _rewrite_links(body_html, token, base_url)
    body_html = _add_tracking_pixel(body_html, token, base_url)
    body_html = _add_unsubscribe_footer(body_html, token, base_url)

    # Monta MIME
    msg = EmailMessage()
    from_name = account.get("from_name")
    from_email = account["from_email"]
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = recipient["email"]
    if account.get("reply_to"):
        msg["Reply-To"] = account["reply_to"]
    msg["Subject"] = subject

    # set_content sempre vem primeiro (define o tipo principal)
    msg.set_content(body_text or "Conteúdo só em HTML — abra em um cliente compatível.")
    msg.add_alternative(body_html, subtype="html")

    # Conecta + envia
    tls_args = _smtp_tls_args(account["smtp_port"], account["smtp_use_tls"])
    try:
        smtp = SMTP(
            hostname=account["smtp_host"],
            port=account["smtp_port"],
            timeout=30.0,
            **tls_args,
        )
        await smtp.connect()
        await smtp.login(account["smtp_user"], password)
        await smtp.send_message(msg)
        await smtp.quit()
        return True, None
    except SMTPException as e:
        return False, f"SMTP: {e}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


# ─── Fallback increment (read-then-write, MVP) ──────────────────────────────

def _increment_counter(db, campaign_id: str, field: str, amount: int = 1) -> None:
    """Increment não-atômico. Aceitável pra MVP single-worker."""
    try:
        result = db.client.table("email_campaigns")\
            .select(field)\
            .eq("id", campaign_id)\
            .maybe_single()\
            .execute()
        current = (result.data.get(field) if result.data else 0) or 0
        db.client.table("email_campaigns")\
            .update({field: current + amount, "updated_at": datetime.now(timezone.utc).isoformat()})\
            .eq("id", campaign_id)\
            .execute()
    except Exception as e:
        logger.error(f"Erro ao incrementar {field} em campaign {campaign_id}: {e}")


# ─── Worker principal ──────────────────────────────────────────────────────

async def process_campaign(campaign_id: str, base_url: str) -> None:
    """
    Loop principal — pega pendentes em ordem (FIFO por created_at) e envia,
    respeitando interval_seconds. Para quando:
      - não tem mais pendentes
      - campanha mudou status (paused/cancelled/failed)
      - daily_limit do account é atingido
    """
    if campaign_id in _running_campaigns:
        logger.warning(f"[email_worker] Campaign {campaign_id} já em execução; ignorando")
        return
    _running_campaigns.add(campaign_id)

    try:
        db = get_db()

        # Marca status 'sending' e started_at se ainda não foi
        now_iso = datetime.now(timezone.utc).isoformat()
        camp_init = db.client.table("email_campaigns")\
            .select("status, started_at")\
            .eq("id", campaign_id)\
            .maybe_single()\
            .execute()
        if not camp_init.data:
            logger.error(f"[email_worker] Campaign {campaign_id} não encontrada")
            return

        update_init = {"status": "sending", "updated_at": now_iso}
        if not camp_init.data.get("started_at"):
            update_init["started_at"] = now_iso
        db.client.table("email_campaigns").update(update_init).eq("id", campaign_id).execute()

        # Carrega campanha + account uma vez
        camp_res = db.client.table("email_campaigns")\
            .select("*")\
            .eq("id", campaign_id)\
            .maybe_single()\
            .execute()
        campaign = camp_res.data
        if not campaign:
            return

        account_id = campaign.get("email_account_id")
        account_res = db.client.table("email_accounts")\
            .select("*")\
            .eq("id", account_id)\
            .maybe_single()\
            .execute()
        account = account_res.data
        if not account:
            logger.error(f"[email_worker] email_account {account_id} não encontrado")
            db.client.table("email_campaigns").update({
                "status": "failed",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", campaign_id).execute()
            return

        interval = max(1, campaign.get("interval_seconds") or 30)
        daily_limit = account.get("daily_limit") or 100
        sent_today = 0  # contador local desta execução

        logger.info(f"[email_worker] Iniciando campaign {campaign_id} (interval={interval}s, daily_limit={daily_limit})")

        while True:
            # Re-checa status (pause/cancel)
            status_check = db.client.table("email_campaigns")\
                .select("status")\
                .eq("id", campaign_id)\
                .maybe_single()\
                .execute()
            curr_status = status_check.data.get("status") if status_check.data else None
            if curr_status not in ("sending", "scheduled"):
                logger.info(f"[email_worker] Campaign {campaign_id} status={curr_status}, parando")
                break

            # Daily limit local
            if sent_today >= daily_limit:
                logger.info(f"[email_worker] Daily limit atingido ({daily_limit}); pausando campaign")
                db.client.table("email_campaigns").update({
                    "status": "paused",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", campaign_id).execute()
                break

            # Próximo pending
            pending = db.client.table("email_campaign_recipients")\
                .select("*")\
                .eq("campaign_id", campaign_id)\
                .eq("status", "pending")\
                .order("created_at")\
                .limit(1)\
                .execute()
            if not pending.data:
                # Sem mais pendentes — terminou
                break

            recipient = pending.data[0]
            logger.info(f"[email_worker] Enviando pra {recipient.get('email')}")

            ok, error = await _send_one(account, recipient, campaign, base_url)
            now_iso = datetime.now(timezone.utc).isoformat()

            if ok:
                db.client.table("email_campaign_recipients").update({
                    "status": "sent",
                    "sent_at": now_iso,
                }).eq("id", recipient["id"]).execute()
                db.client.table("email_events").insert({
                    "recipient_id": recipient["id"],
                    "campaign_id": campaign_id,
                    "event_type": "sent",
                    "occurred_at": now_iso,
                }).execute()
                _increment_counter(db, campaign_id, "sent_count")
                sent_today += 1
            else:
                hard = _is_hard_bounce(error or "")
                update_data = {
                    "status": "bounced" if hard else "failed",
                }
                if hard:
                    update_data["bounced_at"] = now_iso
                    update_data["bounce_reason"] = error
                else:
                    update_data["failed_at"] = now_iso
                    update_data["failure_reason"] = error
                db.client.table("email_campaign_recipients").update(update_data)\
                    .eq("id", recipient["id"]).execute()

                if hard:
                    db.client.table("email_events").insert({
                        "recipient_id": recipient["id"],
                        "campaign_id": campaign_id,
                        "event_type": "bounced",
                        "metadata": {"error": error},
                        "occurred_at": now_iso,
                    }).execute()
                    _increment_counter(db, campaign_id, "bounced_count")
                else:
                    _increment_counter(db, campaign_id, "failed_count")

                logger.warning(f"[email_worker] Falha pra {recipient.get('email')}: {error}")

            # Aguarda interval antes de próximo envio
            await asyncio.sleep(interval)

        # Verifica se sobrou algum pending (pode ter sido interrompido)
        remaining = db.client.table("email_campaign_recipients")\
            .select("id", count="exact")\
            .eq("campaign_id", campaign_id)\
            .eq("status", "pending")\
            .execute()
        remaining_count = remaining.count or 0

        # Se zerou e o status atual é 'sending', marca como 'sent'
        if remaining_count == 0:
            cur = db.client.table("email_campaigns")\
                .select("status")\
                .eq("id", campaign_id)\
                .maybe_single()\
                .execute()
            if cur.data and cur.data.get("status") == "sending":
                db.client.table("email_campaigns").update({
                    "status": "sent",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", campaign_id).execute()
                logger.info(f"[email_worker] Campaign {campaign_id} concluída")

    except Exception as e:
        logger.error(f"[email_worker] Erro inesperado em {campaign_id}: {e}", exc_info=True)
    finally:
        _running_campaigns.discard(campaign_id)
