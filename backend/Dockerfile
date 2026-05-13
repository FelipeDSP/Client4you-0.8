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

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "80"]
