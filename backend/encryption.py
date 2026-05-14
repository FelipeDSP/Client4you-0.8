"""
Symmetric encryption helper for secrets in transit/at-rest (SMTP passwords,
future API keys, etc.).

Usa Fernet (AES-128-CBC + HMAC-SHA256) com chave única do app, vinda de
ENCRYPTION_KEY env var. A chave deve ser gerada uma vez e mantida estável
no tempo — rotação requer re-encriptar todas as senhas existentes.

Para gerar uma chave:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
import os
import logging
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    """Lazily inicializa o Fernet com a chave do env."""
    global _fernet
    if _fernet is not None:
        return _fernet

    key = os.environ.get("ENCRYPTION_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY env var não configurada. "
            "Gere uma com:\n"
            '    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"\n'
            "Depois adicione ao .env e ao Coolify."
        )

    try:
        _fernet = Fernet(key.encode("ascii"))
        return _fernet
    except Exception as e:
        raise RuntimeError(
            f"ENCRYPTION_KEY inválida ({e}). Deve ser uma chave Fernet "
            "URL-safe base64 de 32 bytes."
        ) from e


def encrypt(plaintext: str) -> str:
    """
    Encripta string. Retorna base64 URL-safe.
    String vazia retorna vazia (não encripta).
    """
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(ciphertext: str) -> str:
    """
    Decripta string Fernet. Retorna vazio se input vazio ou inválido.
    Loga o erro mas não levanta — caller decide o que fazer com vazio.
    """
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken:
        logger.error(
            "Falha ao decriptar: token inválido. ENCRYPTION_KEY pode ter mudado "
            "ou ciphertext está corrompido."
        )
        return ""
    except Exception as e:
        logger.error(f"Erro inesperado ao decriptar: {e}")
        return ""
