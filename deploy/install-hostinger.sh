#!/bin/bash
#====================================================================================================
# INSTALAÇÃO RÁPIDA - DISPARADOR DE WHATSAPP
# VPS Hostinger - Debian 13 - IP: 72.60.10.10
#====================================================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

IP_VPS="72.60.10.10"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} INSTALAÇÃO DO DISPARADOR DE WHATSAPP ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Verificar root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Execute como root!${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/7] Atualizando sistema...${NC}"
apt update && apt upgrade -y

echo -e "${YELLOW}[2/7] Instalando dependências...${NC}"
apt install -y python3 python3-venv python3-pip nginx git curl unzip

echo -e "${YELLOW}[3/7] Instalando Node.js 20...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g yarn

echo -e "${YELLOW}[4/7] Criando estrutura...${NC}"
mkdir -p /var/www/disparador
cd /var/www/disparador

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  DEPENDÊNCIAS INSTALADAS!             ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Agora você precisa baixar o código."
echo ""
echo -e "${YELLOW}No Emergent:${NC}"
echo "  1. Clique em 'Save to GitHub' no chat"
echo "  2. Copie o link do repositório"
echo ""
echo -e "${YELLOW}Depois execute:${NC}"
echo "  cd /var/www/disparador"
echo "  git clone https://github.com/SEU_USUARIO/SEU_REPO.git ."
echo "  chmod +x deploy/setup-hostinger.sh"
echo "  ./deploy/setup-hostinger.sh"
echo ""
