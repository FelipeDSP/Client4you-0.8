# 🚀 Deploy do Disparador de WhatsApp na VPS

## Requisitos
- VPS com Debian 13 (ou Ubuntu 20.04+)
- Mínimo 1GB RAM
- Acesso root (SSH)

---

## 📋 Passo a Passo

### 1. Conecte na VPS via SSH
```bash
ssh root@SEU_IP_VPS
```

### 2. Baixe e execute o script de instalação
```bash
# Baixar script
curl -o install.sh https://raw.githubusercontent.com/SEU_REPO/main/deploy/install.sh

# OU copie o conteúdo do arquivo install.sh e cole no servidor
nano install.sh
# (cole o conteúdo, salve com Ctrl+X, Y, Enter)

# Edite o IP da VPS
nano install.sh
# Altere: IP_VPS="SEU_IP_AQUI" para IP_VPS="123.456.789.0" (seu IP real)

# Execute
chmod +x install.sh
sudo ./install.sh
```

### 3. Baixe o código da aplicação
Você pode fazer isso de duas formas:

**Opção A - Via GitHub (se conectou ao Emergent):**
```bash
cd /var/www/disparador
git clone https://github.com/SEU_USUARIO/SEU_REPO.git .
```

**Opção B - Via ZIP:**
1. No Emergent, clique em "Save to GitHub" ou baixe o ZIP
2. Faça upload para a VPS usando SCP ou FileZilla
3. Extraia:
```bash
cd /var/www/disparador
unzip seu-arquivo.zip
# Mova os arquivos se necessário para ficar na estrutura correta
```

### 4. Execute o setup final
```bash
cd /var/www/disparador
sudo ./setup.sh
```

### 5. Acesse a aplicação
Abra no navegador: `http://SEU_IP_VPS`

---

## 🌐 Adicionar Domínio (Depois)

### 1. Configure o DNS
No painel do seu provedor de domínio, adicione:
- **Tipo:** A
- **Nome:** @ (ou subdomínio como "app")
- **Valor:** IP da sua VPS
- **TTL:** 3600

### 2. Execute o script de domínio
```bash
# Edite o domínio no script
nano /var/www/disparador/add-domain.sh
# Altere: DOMINIO="seudominio.com.br"

# Execute
sudo ./add-domain.sh
```

Pronto! SSL será configurado automaticamente com Let's Encrypt.

---

## 🔧 Comandos Úteis

```bash
# Ver status do backend
sudo systemctl status disparador-backend

# Ver logs do backend (tempo real)
sudo journalctl -u disparador-backend -f

# Reiniciar backend
sudo systemctl restart disparador-backend

# Reiniciar nginx
sudo systemctl restart nginx

# Ver logs do nginx
sudo tail -f /var/log/nginx/error.log
```

---

## ⚠️ Troubleshooting

### Backend não inicia
```bash
# Ver erro detalhado
sudo journalctl -u disparador-backend -n 50

# Verificar se porta está em uso
sudo lsof -i :8001

# Testar manualmente
cd /var/www/disparador/backend
source venv/bin/activate
python -c "from server import app; print('OK')"
```

### Frontend não carrega
```bash
# Verificar se build existe
ls -la /var/www/disparador/frontend/dist

# Rebuild se necessário
cd /var/www/disparador/frontend
yarn build

# Verificar permissões
sudo chown -R www-data:www-data /var/www/disparador
```

### API retorna erro
```bash
# Testar API localmente
curl http://127.0.0.1:8001/api/

# Verificar variáveis de ambiente
cat /var/www/disparador/backend/.env
```

---

## 🔄 Atualizar Aplicação

```bash
cd /var/www/disparador

# Se usa Git
git pull origin main

# Rebuild frontend
cd frontend
yarn install
yarn build

# Reiniciar backend
sudo systemctl restart disparador-backend
```
