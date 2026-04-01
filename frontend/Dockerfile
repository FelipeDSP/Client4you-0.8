# Estágio de Build
FROM node:20-alpine as builder
WORKDIR /app

# Instalar dependências
# Nota: yarn.lock* com asterisco torna opcional (funciona com ou sem o arquivo)
COPY package*.json ./
COPY yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install

# Copiar código fonte
COPY . .

# Receber argumentos de build do Coolify
ARG VITE_BACKEND_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_TURNSTILE_SITE_KEY
ARG REACT_APP_BACKEND_URL

# Definir variáveis de ambiente para o build
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Buildar o projeto
RUN yarn build

# Estágio de Servidor (Nginx)
FROM nginx:alpine

# Instalar curl para o healthcheck funcionar
RUN apk add --no-cache curl wget

# Copiar os arquivos gerados no build (Vite gera na pasta 'dist')
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuração do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ⚠️ CORREÇÃO: Expor porta 3000 (Coolify mapeia para esta porta)
EXPOSE 3000

# Healthcheck para Coolify saber quando o app está pronto
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
