# 🚀 Variáveis de Ambiente para Deploy no Coolify

## 📦 BACKEND (FastAPI - Python)

### ✅ **OBRIGATÓRIAS:**

```bash
# Supabase (Banco de Dados + Auth)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=seu-service-role-key-aqui
SUPABASE_JWT_SECRET=seu-jwt-secret-aqui

# WAHA (WhatsApp HTTP API)
WAHA_DEFAULT_URL=https://seu-waha-server.com
WAHA_MASTER_KEY=sua-master-key-do-waha

# CORS (Frontend URL)
CORS_ORIGINS=https://seu-dominio-frontend.com
```

### ⚙️ **OPCIONAIS (com valores padrão):**

```bash
# Ambiente
ENVIRONMENT=production

# Email SMTP (para notificações)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASSWORD=sua-senha-app
SMTP_FROM_EMAIL=noreply@seudominio.com
SMTP_FROM_NAME=Client4You
SMTP_USE_TLS=true

# Kiwify (Webhook de pagamentos)
KIWIFY_WEBHOOK_SECRET=seu-webhook-secret-kiwify

# Turnstile (Cloudflare Captcha)
TURNSTILE_SECRET_KEY=sua-secret-key-turnstile

# Segurança de Login
LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_DURATION=900
LOGIN_LOCKOUT_DURATION=1800

# Admin Whitelist (IPs permitidos para admin)
ADMIN_IP_WHITELIST=
```

---

## 🎨 FRONTEND (React + Vite)

### ✅ **OBRIGATÓRIAS:**

```bash
# URL do Backend
VITE_BACKEND_URL=https://seu-dominio-backend.com/api
```

**IMPORTANTE:** No Coolify, o frontend React usa `VITE_` prefix, não `REACT_APP_`.

---

## 📋 **Como obter as credenciais:**

### **1. Supabase:**
- Acesse: https://supabase.com/dashboard
- Vá em: **Project Settings → API**
- `SUPABASE_URL`: Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: service_role (secret)
- `SUPABASE_JWT_SECRET`: JWT Secret

### **2. WAHA:**
- Se você tem servidor WAHA próprio, use a URL dele
- `WAHA_MASTER_KEY`: Master API Key configurada no WAHA
- Alternativa: https://waha.chatyou.chat (se for usar serviço externo)

### **3. SMTP (Email):**
- Gmail: Use App Password (https://myaccount.google.com/apppasswords)
- SendGrid, Mailgun, etc: Veja documentação do provedor

### **4. Kiwify (Pagamentos):**
- Acesse: https://dashboard.kiwify.com.br
- Vá em: **Configurações → Webhooks**
- Copie o Webhook Secret

---

## 🐳 **Configuração no Coolify:**

### **Backend:**
1. Criar novo serviço: **Docker Compose** ou **Dockerfile**
2. Porta: `8001`
3. Health Check: `/api/health`
4. Adicionar todas as variáveis acima na seção "Environment Variables"

### **Frontend:**
1. Criar novo serviço: **Static Site** ou **Node.js**
2. Build Command: `yarn build` ou `npm run build`
3. Output Directory: `dist`
4. Porta: `3000` (para preview) ou serve estático
5. Adicionar `VITE_BACKEND_URL`

---

## ⚠️ **IMPORTANTE:**

### **CORS_ORIGINS:**
- Deve incluir o domínio do frontend
- Exemplo: `https://app.seudominio.com`
- Pode incluir múltiplos separados por vírgula: `https://app.com,https://www.app.com`

### **VITE_BACKEND_URL:**
- Deve apontar para o domínio do backend + `/api`
- Exemplo: `https://api.seudominio.com/api`
- **NÃO** incluir barra no final

### **Banco de Dados:**
- O Supabase já gerencia PostgreSQL
- **NÃO** precisa de variável `MONGO_URL` (a aplicação não usa MongoDB local)

---

## 🧪 **Teste após Deploy:**

### **Backend:**
```bash
curl https://seu-backend.com/api/health
# Deve retornar: {"status":"healthy"}
```

### **Frontend:**
```bash
# Abrir no navegador e verificar:
# - Console sem erros de CORS
# - Requisições para backend funcionando
# - Login funcionando
```

---

## 📞 **Troubleshooting:**

### **Erro de CORS:**
- Verificar `CORS_ORIGINS` no backend
- Certificar que inclui o domínio do frontend

### **Erro 401 (Autenticação):**
- Verificar `SUPABASE_JWT_SECRET`
- Verificar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`

### **WhatsApp não envia:**
- Verificar `WAHA_DEFAULT_URL` e `WAHA_MASTER_KEY`
- Verificar se sessão do WhatsApp está conectada no WAHA

### **Email não envia:**
- Verificar todas variáveis `SMTP_*`
- Testar credenciais SMTP separadamente

---

## 🔐 **Segurança:**

1. **NUNCA** commitar `.env` no Git
2. Usar senhas fortes para SMTP e Supabase
3. Configurar HTTPS no Coolify (Let's Encrypt)
4. Habilitar Turnstile (Cloudflare) em produção
5. Configurar backup do Supabase

---

## 📚 **Arquivos de Referência:**

- Backend: `/app/backend/server.py`
- Frontend: `/app/frontend/src/`
- Docker: `/app/docker-compose.yml`
- Health Check: `/app/backend/server.py` (linha 177-179)

---

✅ **Pronto!** Com essas variáveis configuradas, sua aplicação estará pronta para rodar no Coolify.
