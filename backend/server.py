from fastapi import FastAPI, Request, APIRouter
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
import logging
from pathlib import Path
from datetime import datetime

# Load env variables safely
CURRENT_DIR = Path(__file__).parent
dotenv_path = CURRENT_DIR / '.env'
if not dotenv_path.exists():
    dotenv_path = CURRENT_DIR.parent / '.env'
load_dotenv(dotenv_path)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ── Precondição de concorrência ─────────────────────────────────────────
# email_worker.py e enrichment_worker.py usam dedup in-memory que assume
# 1 worker uvicorn. Se alguém subir --workers N>1 intencionalmente, precisa
# setar UVICORN_WORKER_COUNT=N pra deixar a infra registrar warning crítico
# (e idealmente migrar workers pra Celery antes — ver TECH_DEBT.md#3).
def _check_worker_assumption() -> None:
    try:
        declared = int(os.environ.get("UVICORN_WORKER_COUNT", "1"))
    except (TypeError, ValueError):
        declared = 1
    if declared != 1:
        logger.critical(
            f"⚠️  UVICORN_WORKER_COUNT={declared} — email_worker/enrichment_worker "
            "usam dedup in-memory e NÃO são multi-worker-safe. Risco de "
            "double-send em campanhas e double-charge em Firecrawl. "
            "Ver docs/TECH_DEBT.md#3 antes de prosseguir."
        )


_check_worker_assumption()


# ── Feature flag: módulo de Campanhas de Email ───────────────────────────
# Quando False (default), as rotas /api/email-accounts, /api/email-campaigns
# e /api/email-tracking NÃO são registradas — endpoints retornam 404 e o
# worker process_campaign NUNCA é disparado (só era chamado via endpoint
# email_campaigns:send). Tabelas e dados no banco ficam intactos.
# Pra reativar: setar ENABLE_CAMPAIGNS=true (env) + rebuild com
# VITE_ENABLE_CAMPAIGNS=true no frontend. Ver docs/FEATURE_FLAGS.md.
ENABLE_CAMPAIGNS = os.environ.get("ENABLE_CAMPAIGNS", "false").lower() == "true"

# Create the main app instance
app = FastAPI(title="Lead Dispatcher API", version="2.2.0")

if not ENABLE_CAMPAIGNS:
    logger.info(
        "Campanhas de email DESABILITADAS (ENABLE_CAMPAIGNS=false). "
        "Endpoints /api/email-* não registrados — worker process_campaign nunca dispara."
    )

# Configure rate limiter globally
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Custom validation error handler.
# Não logamos `exc.body` nem o devolvemos no payload: o body pode conter
# credenciais (senhas em login, tokens em headers, etc.) e o log seria
# escrito em texto claro nos logs do Coolify.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"❌ Validation error on {request.url}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )

# Middlewares Setup
cors_origins_str = os.environ.get('CORS_ORIGINS', '')
if cors_origins_str and cors_origins_str != '*':
    # Saneamento robusto: remove aspas, barras no final e espaços de todas as URLs passadas
    cors_origins = [
        origin.strip().strip('"').strip("'").rstrip('/')
        for origin in cors_origins_str.split(',') if origin.strip()
    ]
else:
    # Se não configurado, garante pelo menos o domínio de produção e localhost
    cors_origins = [
        "https://app.client4you.com.br",
        "http://localhost:3000",
        "http://localhost:5173"
    ]
    logger.warning("⚠️ CORS_ORIGINS não configurado via env var - usando origin padrão de produção")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Accept", "X-Session-Token"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# ==========================================================
# IMPORT MODULAR ROUTERS
# ==========================================================
from routes.leads import router as leads_router
from routes.dashboard import router as dashboard_router
from routes.quotas import router as quotas_router
from routes.admin import admin_router
from routes.auth import security_router
from routes.webhooks import webhook_router

# Imports dos módulos de campanhas vivem dentro do guard pra evitar carregar
# email_worker / email_service / dependências SMTP em produção quando a
# feature está desligada (default).
if ENABLE_CAMPAIGNS:
    from routes.email_accounts import router as email_accounts_router
    from routes.email_campaigns import router as email_campaigns_router
    from routes.email_tracking import router as email_tracking_router

# Setup unified API router
api_router = APIRouter(prefix="/api")

# Top-level API health and root
@api_router.get("/")
async def root():
    return {"message": "Client4you API", "version": "3.0.0", "mode": "Lead Management"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# Include domain-specific routes
api_router.include_router(leads_router)
api_router.include_router(dashboard_router)
api_router.include_router(quotas_router)

if ENABLE_CAMPAIGNS:
    api_router.include_router(email_accounts_router)
    api_router.include_router(email_campaigns_router)
    api_router.include_router(email_tracking_router)

# Attach everything to the main app
app.include_router(api_router)
app.include_router(admin_router)
app.include_router(security_router)
app.include_router(webhook_router)