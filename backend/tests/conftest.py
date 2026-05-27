"""Pytest config compartilhado.

Coloca `backend/` no `sys.path` pra `from services...` funcionar sem instalação
editável (o projeto não tem `setup.py`/`pyproject.toml`).
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
