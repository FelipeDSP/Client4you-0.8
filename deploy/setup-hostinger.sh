#!/bin/bash
#====================================================================================================
# SETUP FINAL - HOSTINGER VPS
# IP: 72.60.10.10
#====================================================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

IP_VPS="72.60.10.10"

cd /var/www/disparador

echo -e "${YELLOW}[1/5] Configurando Backend...${NC}"
cd /var/www/disparador/backend

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

cat > .env << EOF
SUPABASE_URL="https://owlignktsqlrqaqhzujb.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93bGlnbmt0c3FscnFhcWh6dWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjUzMzAsImV4cCI6MjA4MzkwMTMzMH0.B9UhTYi8slAx2UWsSckys55O9VQHdkYIHyqhSeFy8Z0"
CORS_ORIGINS="http://${IP_VPS},http://${IP_VPS}:80"
EOF

deactivate

echo -e "${YELLOW}[2/5] Configurando Frontend...${NC}"
cd /var/www/disparador/frontend

cat > .env << EOF
REACT_APP_BACKEND_URL="http://${IP_VPS}"
EOF

yarn install
yarn build

echo -e "${YELLOW}[3/5] Criando serviço systemd...${NC}"
cat > /etc/systemd/system/disparador.service << EOF
[Unit]
Description=Disparador WhatsApp API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/disparador/backend
Environment=PATH=/var/www/disparador/backend/venv/bin
ExecStart=/var/www/disparador/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable disparador
systemctl start disparador

echo -e "${YELLOW}[4/5] Configurando Nginx...${NC}"
cat > /etc/nginx/sites-available/disparador << EOF
server {
    listen 80;
    server_name ${IP_VPS};

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
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/disparador /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo -e "${YELLOW}[5/5] Verificando...${NC}"
sleep 3

if systemctl is-active --quiet disparador; then
    echo -e "${GREEN}✅ Backend OK${NC}"
else
    echo -e "${RED}❌ Backend com erro${NC}"
fi

if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ Nginx OK${NC}"
else
    echo -e "${RED}❌ Nginx com erro${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}     INSTALAÇÃO CONCLUÍDA! 🎉          ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Acesse: ${YELLOW}http://${IP_VPS}${NC}"
echo ""
echo -e "Comandos úteis:"
echo "  systemctl status disparador    # Ver status"
echo "  journalctl -u disparador -f    # Ver logs"
echo "  systemctl restart disparador   # Reiniciar"
echo ""
