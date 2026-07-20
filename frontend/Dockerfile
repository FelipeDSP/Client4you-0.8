# Estágio de Build
FROM node:20-alpine AS builder
WORKDIR /app

# Instalar dependências com npm ci (usa package-lock.json, build reproducível)
COPY package.json package-lock.json ./
RUN npm ci

# Copiar código fonte
COPY . .

# Variáveis de build injetadas pelo Coolify (apenas as realmente lidas pelo código)
ARG VITE_BACKEND_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_ENABLE_CAMPAIGNS

ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_ENABLE_CAMPAIGNS=$VITE_ENABLE_CAMPAIGNS

RUN npm run build

# Estágio de Servidor (Nginx)
FROM nginx:alpine

RUN apk add --no-cache wget

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
