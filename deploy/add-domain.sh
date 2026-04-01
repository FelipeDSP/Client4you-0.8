#!/bin/bash
#====================================================================================================
# ADICIONAR DOMÍNIO + SSL GRÁTIS
# 
# ANTES DE EXECUTAR:
# 1. No painel da Hostinger (ou onde comprou o domínio), configure o DNS:
#    - Tipo: A
#    - Nome: @ (ou deixe vazio)
#    - Aponta para: 72.60.10.10
#    - TTL: 3600
#
# 2. Se quiser www também, adicione outro registro:
#    - Tipo: A  
#    - Nome: www
#    - Aponta para: 72.60.10.10
#
# 3. Aguarde 5-30 minutos para o DNS propagar
#
# 4. Edite a variável DOMINIO abaixo e execute este script
#====================================================================================================

# ⚠️ COLOQUE SEU DOMÍNIO AQUI
DOMINIO="seudominio.com.br"

#====================================================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   CONFIGURANDO DOMÍNIO + SSL          ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Execute como root: sudo ./add-domain.sh${NC}"
    exit 1
fi

if [ "$DOMINIO" = "seudominio.com.br" ]; then
    echo -e "${RED}ERRO: Edite este arquivo e coloque seu domínio!${NC}"
    echo -e "${YELLOW}nano /var/www/disparador/deploy/add-domain.sh${NC}"
    exit 1
fi

# Verificar se domínio resolve para este IP
echo -e "${YELLOW}Verificando DNS...${NC}"
RESOLVED_IP=$(dig +short $DOMINIO | head -1)
if [ "$RESOLVED_IP" != "72.60.10.10" ]; then
    echo -e "${RED}⚠️  ATENÇÃO: O domínio $DOMINIO ainda não aponta para 72.60.10.10${NC}"
    echo -e "${RED}   Está apontando para: $RESOLVED_IP${NC}"
    echo ""
    echo -e "${YELLOW}Você configurou o DNS? Pode levar até 30 minutos para propagar.${NC}"
    read -p "Deseja continuar mesmo assim? (s/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        exit 1
    fi
fi

echo -e "${YELLOW}[1/5] Instalando Certbot...${NC}"
apt install -y certbot python3-certbot-nginx

echo -e "${YELLOW}[2/5] Atualizando Nginx...${NC}"
cat > /etc/nginx/sites-available/disparador << EOF
server {
    listen 80;
    server_name ${DOMINIO} www.${DOMINIO};

    root /var/www/disparador/frontend/dist;
    index index.html;

    client_max_body_size 50M;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }
}
EOF

nginx -t && systemctl reload nginx

echo -e "${YELLOW}[3/5] Atualizando Backend .env...${NC}"
cat > /var/www/disparador/backend/.env << EOF
SUPABASE_URL="https://owlignktsqlrqaqhzujb.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93bGlnbmt0c3FscnFhcWh6dWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjUzMzAsImV4cCI6MjA4MzkwMTMzMH0.B9UhTYi8slAx2UWsSckys55O9VQHdkYIHyqhSeFy8Z0"
CORS_ORIGINS="https://${DOMINIO},http://${DOMINIO},https://www.${DOMINIO}"
EOF

systemctl restart disparador

echo -e "${YELLOW}[4/5] Atualizando Frontend e rebuild...${NC}"
cat > /var/www/disparador/frontend/.env << EOF
REACT_APP_BACKEND_URL="https://${DOMINIO}"
EOF

cd /var/www/disparador/frontend
yarn build

echo -e "${YELLOW}[5/5] Obtendo certificado SSL (Let's Encrypt)...${NC}"
certbot --nginx -d ${DOMINIO} -d www.${DOMINIO} --non-interactive --agree-tos --email admin@${DOMINIO} --redirect || \
certbot --nginx -d ${DOMINIO} --non-interactive --agree-tos --email admin@${DOMINIO} --redirect

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}     DOMÍNIO CONFIGURADO! 🎉           ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Acesse: ${YELLOW}https://${DOMINIO}${NC}"
echo ""
echo -e "${GREEN}✅ SSL será renovado automaticamente${NC}"
echo ""
