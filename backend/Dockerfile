# Imagem base Python
FROM python:3.11-slim

WORKDIR /app

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
  gcc \
  python3-dev \
  libmagic1 \
  curl \
  && rm -rf /var/lib/apt/lists/*

# Copiar requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fonte
COPY . .

# Criar usuário não-root e diretório de uploads com permissões corretas.
# O volume `backend-uploads` no docker-compose monta em /app/uploads, então
# o diretório precisa existir e ser writable por appuser antes do mount.
RUN groupadd --system --gid 1001 appuser \
  && useradd --system --uid 1001 --gid appuser --create-home appuser \
  && mkdir -p /app/uploads \
  && chown -R appuser:appuser /app

USER appuser

EXPOSE 80

# Healthcheck para Coolify
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:80/api/health || exit 1

# ⚠️  IMPORTANTE: NÃO adicione --workers N (ex: --workers 2) sem ler antes:
#     docs/TECH_DEBT.md#3
#
# email_worker.py e enrichment_worker.py usam dedup in-memory
# (_running_campaigns e _running_batches). Esse set não é compartilhado entre
# processos uvicorn — multi-worker quebra dedup silenciosamente: 2 processos
# podem rodar o mesmo batch/campanha em paralelo, gerando double-send em
# campanhas e double-charge em Firecrawl.
#
# Se precisar de mais throughput: migrar workers pra Celery + Redis primeiro
# (TECH_DEBT.md#3) e ENTÃO escalar uvicorn horizontalmente.
#
# Se mesmo assim subir --workers >1 intencionalmente, sete UVICORN_WORKER_COUNT
# pra o mesmo número — server.py loga CRITICAL no startup pra deixar visível.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "80"]
