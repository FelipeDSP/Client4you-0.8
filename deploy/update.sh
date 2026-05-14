#!/bin/bash
set -euo pipefail
trap 'echo "❌ Erro na linha $LINENO. Abortando."; exit 1' ERR
#====================================================================================================
# ATUALIZAR APLICAÇÃO
# 
# Execute este script sempre que fizer alterações no Emergent e salvar no GitHub
# Uso: ./update.sh
#====================================================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}     ATUALIZANDO APLICAÇÃO...          ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

cd /var/www/disparador

echo -e "${YELLOW}[1/4] Baixando atualizações do GitHub...${NC}"
git pull origin main

echo -e "${YELLOW}[2/4] Atualizando dependências do backend...${NC}"
cd /var/www/disparador/backend
source venv/bin/activate
pip install -r requirements.txt --quiet
deactivate

echo -e "${YELLOW}[3/4] Atualizando frontend...${NC}"
cd /var/www/disparador/frontend
yarn install
yarn build

echo -e "${YELLOW}[4/4] Reiniciando serviços...${NC}"
systemctl restart disparador
systemctl reload nginx

sleep 2

if systemctl is-active --quiet disparador; then
    echo -e "${GREEN}✅ Backend OK${NC}"
else
    echo -e "${RED}❌ Backend com erro - execute: journalctl -u disparador -n 50${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}     ATUALIZAÇÃO CONCLUÍDA! 🎉         ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
