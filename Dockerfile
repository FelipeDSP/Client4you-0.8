FROM python:3.11-slim

# Instalar Node.js e Nginx
RUN apt-get update && apt-get install -y \
    curl \
    nginx \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g yarn \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ===== BACKEND =====
COPY backend/requirements.txt /app/backend/
RUN sed -i '/emergentintegrations/d' /app/backend/requirements.txt && \
    pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/

# ===== FRONTEND =====
COPY frontend/package.json frontend/yarn.lock* /app/frontend/
WORKDIR /app/frontend
RUN yarn install

COPY frontend/ /app/frontend/

# Build com variável de ambiente
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN yarn build

# Copiar build para nginx
RUN cp -r /app/frontend/dist/* /var/www/html/

# ===== NGINX CONFIG =====
RUN echo 'server { \n\
    listen 80; \n\
    root /var/www/html; \n\
    index index.html; \n\
    client_max_body_size 50M; \n\
    location / { \n\
        try_files $uri $uri/ /index.html; \n\
    } \n\
    location /api/ { \n\
        proxy_pass http://127.0.0.1:8001; \n\
        proxy_http_version 1.1; \n\
        proxy_set_header Host $host; \n\
        proxy_set_header X-Real-IP $remote_addr; \n\
        proxy_read_timeout 300s; \n\
    } \n\
}' > /etc/nginx/sites-available/default

# ===== STARTUP SCRIPT =====
RUN echo '#!/bin/bash \n\
cd /app/backend \n\
uvicorn server:app --host 127.0.0.1 --port 8001 & \n\
nginx -g "daemon off;"' > /start.sh && chmod +x /start.sh

WORKDIR /app

EXPOSE 80

CMD ["/start.sh"]
