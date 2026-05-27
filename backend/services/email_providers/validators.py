"""Extração, validação e scoring de emails (com suporte a ofuscações em PT/EN).

Decisões de design:

- Deobfuscação ESPAÇADA suporta só português (` arroba `, ` ponto `). A versão
  inglesa (` at `, ` dot `) é ambígua demais — "meet you at empresa.com" viraria
  "you@empresa.com". Brackets (`[at]`, `(arroba)`, `{dot}`) funcionam em ambos.
- Scoring tem baseline 0.5 (neutro). Threshold de validade > 0.3 — emails sem
  sinal negativo passam mesmo sem site do lead pra comparar.
- Blacklist (local part OU domínio) força score 0.0 independente do resto.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional
from urllib.parse import urlparse


# ─── Blacklists ────────────────────────────────────────────────────────────

# Local parts que NUNCA são endereços de contato real.
BLACKLIST_LOCAL_PARTS: frozenset[str] = frozenset({
    "noreply", "no-reply", "nao-responda", "naoresponda", "naoresponder",
    "donotreply", "do-not-reply", "mailer-daemon",
    "wordpress", "wp", "admin", "administrator",
    "webmaster", "postmaster", "abuse", "hostmaster",
    "root", "daemon",
})

# Domínios que indicam scrape sujo (provedor de hospedagem, exemplo, plataforma).
# Match também para subdomínios (mail.wordpress.com cai porque wordpress.com está aqui).
BLACKLIST_DOMAINS: frozenset[str] = frozenset({
    "hostgator.com.br", "locaweb.com.br", "kinghost.com.br", "uolhost.com.br",
    "wix.com", "wixsite.com", "wordpress.com", "blogspot.com",
    "sentry.io", "googleapis.com", "google.com", "cloudflare.com",
    "facebook.com", "instagram.com", "twitter.com", "linkedin.com",
    "example.com", "example.org", "domain.com", "email.com",
})

# Local parts que sugerem contato corporativo (pequeno boost no score).
CORPORATE_LOCAL_PARTS: frozenset[str] = frozenset({
    "contato", "contact", "comercial", "vendas", "sales",
    "atendimento", "suporte", "support", "sac", "info",
    "orcamento", "orcamentos", "financeiro", "rh",
})


# ─── Regexes ───────────────────────────────────────────────────────────────

# Pragmático, não RFC-completo. Local part aceita +, _, -, ponto.
EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)

# Heurística "nome.sobrenome" — provável email pessoal (penaliza).
PERSONAL_LOCAL_RE = re.compile(r"^[a-z]{2,}\.[a-z]{2,}$")

# ─── Padrões de ofuscação ─────────────────────────────────────────────────
# Brackets/parens: aceita PT e EN ("at"/"arroba", "dot"/"ponto").
_OBF_AT_BRACKETED = re.compile(
    r"\s*[\[\(\{]\s*(?:at|arroba)\s*[\]\)\}]\s*",
    re.IGNORECASE,
)
_OBF_DOT_BRACKETED = re.compile(
    r"\s*[\[\(\{]\s*(?:dot|ponto)\s*[\]\)\}]\s*",
    re.IGNORECASE,
)
# Espaçado: SÓ português. "at"/"dot" em inglês geram falso-positivo demais.
_OBF_AT_SPACED_PT = re.compile(r"\s+arroba\s+", re.IGNORECASE)
_OBF_DOT_SPACED_PT = re.compile(r"\s+ponto\s+", re.IGNORECASE)


# ─── Domain helpers ────────────────────────────────────────────────────────

def get_domain(url: Optional[str]) -> Optional[str]:
    """Extrai o domínio canônico (sem www, sem path, sem porta) de uma URL."""
    if not url:
        return None
    raw = url.strip()
    if not raw:
        return None
    try:
        if "//" not in raw:
            raw = "http://" + raw
        parsed = urlparse(raw)
        host = (parsed.netloc or "").lower().strip()
        host = host.split("@")[-1]  # user:pass@host
        host = host.split(":")[0]   # porta
        if host.startswith("www."):
            host = host[4:]
        return host or None
    except Exception:
        return None


def _normalize_for_match(s: str) -> str:
    """Lowercase + remove hífens/underscores — pra fuzzy match de domínio."""
    return re.sub(r"[-_]", "", s.lower())


def _domain_match_score(email_domain: str, site_domain: Optional[str]) -> float:
    """Quanto o domínio do email "casa" com o domínio do site do lead.

    Returns:
        0.5  match exato ou subdomínio
        0.4  mesma raiz, TLD diferente (empresa.com vs empresa.com.br)
        0.3  match fuzzy — hífens/underscores ignorados (borderline)
        0.0  sem match
    """
    if not site_domain:
        return 0.0

    e = email_domain.lower()
    s = site_domain.lower()

    if e == s:
        return 0.5
    if e.endswith("." + s) or s.endswith("." + e):
        return 0.5

    e_root = e.split(".")[0]
    s_root = s.split(".")[0]
    if e_root and s_root and e_root == s_root and len(e_root) >= 3:
        return 0.4

    e_norm = _normalize_for_match(e_root)
    s_norm = _normalize_for_match(s_root)
    if e_norm and s_norm and e_norm == s_norm and len(e_norm) >= 4:
        return 0.3

    return 0.0


def _is_blacklisted_domain(domain: str) -> bool:
    d = domain.lower()
    if d in BLACKLIST_DOMAINS:
        return True
    return any(d.endswith("." + bd) for bd in BLACKLIST_DOMAINS)


# ─── Extração ───────────────────────────────────────────────────────────────

def _deobfuscate(text: str) -> str:
    """Substitui ofuscações comuns por `@` e `.` antes do regex normal."""
    out = text
    out = _OBF_AT_BRACKETED.sub("@", out)
    out = _OBF_DOT_BRACKETED.sub(".", out)
    out = _OBF_AT_SPACED_PT.sub("@", out)
    out = _OBF_DOT_SPACED_PT.sub(".", out)
    return out


def extract_emails(text: Optional[str]) -> list[str]:
    """Extrai emails (normais + ofuscados), lowercase, dedup preservando ordem."""
    if not text:
        return []
    deobf = _deobfuscate(text)
    raw = EMAIL_RE.findall(deobf)
    seen: set[str] = set()
    result: list[str] = []
    for e in raw:
        norm = e.lower().strip(".")
        if norm and norm not in seen:
            seen.add(norm)
            result.append(norm)
    return result


# `extract_cnpjs` foi movido para `services.cnpj_utils` no PR 3 — onde também
# vivem a validação de dígito verificador e a normalização. Use:
#     from services.cnpj_utils import extract_cnpjs


# ─── Scoring + validação ────────────────────────────────────────────────────

def score_email(email: str, lead_domain: Optional[str]) -> float:
    """Score de confiança 0.0 a 1.0.

    Baseline 0.5 (neutro). Ajustes:
    - +0.5/0.4/0.3 conforme match de domínio (`_domain_match_score`)
    - +0.2 se TLD `.br`
    - +0.1 se local part corporativa (`contato`, `vendas`, ...)
    - -0.3 se local part parece pessoal (`nome.sobrenome`)
    - 0.0 forçado se local part OU domínio na blacklist
    """
    if not email:
        return 0.0
    e = email.lower().strip()
    local, _, dom = e.partition("@")
    if not local or not dom:
        return 0.0

    if local in BLACKLIST_LOCAL_PARTS:
        return 0.0
    if _is_blacklisted_domain(dom):
        return 0.0

    score = 0.5
    score += _domain_match_score(dom, lead_domain)
    if dom.endswith(".br"):
        score += 0.2
    if local in CORPORATE_LOCAL_PARTS:
        score += 0.1
    if PERSONAL_LOCAL_RE.match(local):
        score -= 0.3

    return max(0.0, min(1.0, score))


def is_valid_email(email: str, lead: dict) -> bool:
    """Email é aceitável pro lead? Threshold conservador (>0.3)."""
    # Aceita tanto `website` (campo histórico) quanto `domain` (DataForSEO).
    domain = get_domain(lead.get("website") or lead.get("domain"))
    return score_email(email, domain) > 0.3


def pick_best_email(
    emails: Iterable[str],
    lead: dict,
) -> Optional[tuple[str, float]]:
    """Dado múltiplos candidatos, retorna (email, score) do melhor — ou None.

    Em caso de empate, o primeiro candidato ganha (estável).
    """
    domain = get_domain(lead.get("website") or lead.get("domain"))
    best: Optional[tuple[str, float]] = None
    for e in emails:
        s = score_email(e, domain)
        if s > 0.3 and (best is None or s > best[1]):
            best = (e, s)
    return best
