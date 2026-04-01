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

# Create the main app instance
app = FastAPI(title="Lead Dispatcher API", version="2.2.0")

# Configure rate limiter globally
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Custom validation error handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"❌ Validation error on {request.url}: {exc.errors()}")
    logger.error(f"Body: {exc.body}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body}
    )

# Middlewares Setup
cors_origins_str = os.environ.get('CORS_ORIGINS', '')
if cors_origins_str and cors_origins_str != '*':
    cors_origins = [origin.strip() for origin in cors_origins_str.split(',') if origin.strip()]
else:
    cors_origins = ["http://localhost:3000", "http://localhost:5173"]
    logger.warning("⚠️ CORS_ORIGINS não configurado - usando apenas localhost")

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
from routes.whatsapp import router as whatsapp_router
from routes.leads import router as leads_router
from routes.campaigns import router as campaigns_router
from routes.dashboard import router as dashboard_router
from routes.quotas import router as quotas_router
from routes.admin import admin_router
from routes.auth import security_router
from routes.webhooks import webhook_router
from routes.openai_proxy import router as openai_proxy_router

# Setup unified API router
api_router = APIRouter(prefix="/api")

# Top-level API health and root
@api_router.get("/")
async def root():
    return {"message": "Lead Dispatcher API", "version": "2.2.0", "mode": "Modularized"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# Include domain-specific routes
api_router.include_router(whatsapp_router)
api_router.include_router(leads_router)
api_router.include_router(campaigns_router)
api_router.include_router(dashboard_router)
api_router.include_router(quotas_router)
api_router.include_router(openai_proxy_router)

# Attach everything to the main app
app.include_router(api_router)
app.include_router(admin_router)
app.include_router(security_router)
app.include_router(webhook_router)