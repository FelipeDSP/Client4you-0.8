#!/bin/bash
#====================================================================================================
# SCRIPT DE INSTALAÇÃO - DISPARADOR DE WHATSAPP
# Para: Debian 13 (Trixie)
# 
# COMO USAR:
# 1. Copie este arquivo para sua VPS
# 2. Edite a variável IP_VPS abaixo com o IP da sua VPS
# 3. Execute: chmod +x install.sh && sudo ./install.sh
#====================================================================================================

# ⚠️ CONFIGURE AQUI O IP DA SUA VPS
IP_VPS="SEU_IP_AQUI"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} INSTALAÇÃO DO DISPARADOR DE WHATSAPP ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Por favor, execute como root (sudo)${NC}"
    exit 1
fi

# Verificar se IP foi configurado
if [ "$IP_VPS" = "SEU_IP_AQUI" ]; then
    echo -e "${RED}ERRO: Você precisa editar este arquivo e colocar o IP da sua VPS!${NC}"
    echo -e "${YELLOW}Abra o arquivo e altere a linha: IP_VPS=\"SEU_IP_AQUI\"${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/8] Atualizando sistema...${NC}"
apt update && apt upgrade -y

echo -e "${YELLOW}[2/8] Instalando dependências...${NC}"
apt install -y python3 python3-venv python3-pip nginx git curl

# Instalar Node.js 20.x
echo -e "${YELLOW}[3/8] Instalando Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Instalar Yarn
npm install -g yarn

echo -e "${YELLOW}[4/8] Criando estrutura de diretórios...${NC}"
mkdir -p /var/www/disparador
cd /var/www/disparador

echo -e "${YELLOW}[5/8] Baixando código...${NC}"
echo -e "${YELLOW}ATENÇÃO: Você precisa baixar o código manualmente!${NC}"
echo ""
echo "Opções:"
echo "  1. Se conectou ao GitHub no Emergent:"
echo "     git clone https://github.com/SEU_USUARIO/SEU_REPO.git ."
echo ""
echo "  2. Se baixou o ZIP:"
echo "     - Faça upload do ZIP para a VPS"
echo "     - Execute: unzip arquivo.zip -d /var/www/disparador"
echo ""
echo -e "${YELLOW}Após baixar o código, execute o script: setup.sh${NC}"

# Criar script de setup
cat > /var/www/disparador/setup.sh << 'SETUP_SCRIPT'
#!/bin/bash
IP_VPS="__IP_PLACEHOLDER__"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd /var/www/disparador

echo -e "${YELLOW}[1/5] Configurando Backend...${NC}"
cd /var/www/disparador/backend

# Criar ambiente virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependências
pip install --upgrade pip
pip install -r requirements.txt

# Criar .env do backend
cat > .env << EOF
SUPABASE_URL="https://owlignktsqlrqaqhzujb.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93bGlnbmt0c3FscnFhcWh6dWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjUzMzAsImV4cCI6MjA4MzkwMTMzMH0.B9UhTYi8slAx2UWsSckys55O9VQHdkYIHyqhSeFy8Z0"
CORS_ORIGINS="http://${IP_VPS},http://${IP_VPS}:80,http://${IP_VPS}:3000"
EOF

deactivate

echo -e "${YELLOW}[2/5] Configurando Frontend...${NC}"
cd /var/www/disparador/frontend

# Criar .env do frontend
cat > .env << EOF
REACT_APP_BACKEND_URL="http://${IP_VPS}"
EOF

# Instalar e buildar
yarn install
yarn build

echo -e "${YELLOW}[3/5] Criando serviço do Backend...${NC}"
cat > /etc/systemd/system/disparador-backend.service << EOF
[Unit]
Description=Disparador Backend API
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/disparador/backend
Environment=PATH=/var/www/disparador/backend/venv/bin
ExecStart=/var/www/disparador/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Ajustar permissões
chown -R www-data:www-data /var/www/disparador

# Ativar serviço
systemctl daemon-reload
systemctl enable disparador-backend
systemctl start disparador-backend

echo -e "${YELLOW}[4/5] Configurando Nginx...${NC}"
cat > /etc/nginx/sites-available/disparador << EOF
server {
    listen 80;
    server_name ${IP_VPS};

    # Frontend (arquivos estáticos)
    root /var/www/disparador/frontend/dist;
    index index.html;

    # Tamanho máximo de upload (para planilhas)
    client_max_body_size 50M;

    # Rotas do React SPA
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy para API Backend
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
        proxy_connect_timeout 75s;
    }
}
EOF

# Remover site default e ativar disparador
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/disparador /etc/nginx/sites-enabled/

# Testar e recarregar nginx
nginx -t && systemctl reload nginx

echo -e "${YELLOW}[5/5] Verificando instalação...${NC}"
sleep 3

# Verificar backend
if systemctl is-active --quiet disparador-backend; then
    echo -e "${GREEN}✅ Backend rodando!${NC}"
else
    echo -e "${RED}❌ Backend com problema. Verifique: journalctl -u disparador-backend${NC}"
fi

# Verificar nginx
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ Nginx rodando!${NC}"
else
    echo -e "${RED}❌ Nginx com problema. Verifique: journalctl -u nginx${NC}"
fi

# Testar API
API_RESPONSE=$(curl -s http://127.0.0.1:8001/api/)
if [[ $API_RESPONSE == *"Lead Dispatcher API"* ]]; then
    echo -e "${GREEN}✅ API respondendo corretamente!${NC}"
else
    echo -e "${RED}❌ API não respondeu. Verifique os logs.${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}     INSTALAÇÃO CONCLUÍDA! 🎉          ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Acesse: ${YELLOW}http://${IP_VPS}${NC}"
echo ""
echo -e "${YELLOW}Comandos úteis:${NC}"
echo "  - Ver logs do backend: journalctl -u disparador-backend -f"
echo "  - Reiniciar backend:   systemctl restart disparador-backend"
echo "  - Status do backend:   systemctl status disparador-backend"
echo ""
SETUP_SCRIPT

# Substituir placeholder do IP
sed -i "s/__IP_PLACEHOLDER__/${IP_VPS}/g" /var/www/disparador/setup.sh
chmod +x /var/www/disparador/setup.sh

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}     PARTE 1 CONCLUÍDA!                ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Agora você precisa:"
echo -e "  1. Baixar o código para ${YELLOW}/var/www/disparador${NC}"
echo -e "  2. Executar: ${YELLOW}cd /var/www/disparador && sudo ./setup.sh${NC}"
echo ""
