# 🚀 Variáveis de Ambiente para Deploy no Coolify

## 📦 BACKEND (FastAPI - Python)

### ✅ **OBRIGATÓRIAS:**

```bash
# Supabase (Banco de Dados + Auth)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=seu-service-role-key-aqui
SUPABASE_JWT_SECRET=seu-jwt-secret-aqui

# CORS (Frontend URL)
CORS_ORIGINS=https://seu-dominio-frontend.com

# Chave Fernet pra encriptar segredos (senhas SMTP em email_accounts).
# Gere com: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# NUNCA mude depois de ter segredos encriptados.
ENCRYPTION_KEY=sua-chave-fernet-base64
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

# Concorrência de workers — precondição dos workers em-processo
# Mantenha em 1 ou omita. Se aumentar a flag --workers no uvicorn, sete esta
# variável pro mesmo número pra deixar o warning crítico aparecer no startup.
# Ver docs/TECH_DEBT.md#3.
UVICORN_WORKER_COUNT=1

# ── Feature flag: módulo de Campanhas de Email ──
# Quando "false" (default agora), as rotas /api/email-accounts,
# /api/email-campaigns e /api/email-tracking NÃO são registradas, o worker
# process_campaign nunca dispara, e o frontend esconde tudo de campanha.
# Pra reativar: set ENABLE_CAMPAIGNS=true (backend) + VITE_ENABLE_CAMPAIGNS=true
# (frontend, rebuild) + redeploy. Ver docs/FEATURE_FLAGS.md.
# IMPORTANTE: os DOIS precisam estar sincronizados.
ENABLE_CAMPAIGNS=false
```

### 🔍 **DataForSEO (busca de leads no Google Maps):**

```bash
# Credenciais (vivem só no backend — não no banco, não por empresa)
DATAFORSEO_LOGIN=seu_login
DATAFORSEO_PASSWORD=sua_password

# Base URL — sandbox em dev, produção em prod (default: produção)
DATAFORSEO_BASE_URL=https://api.dataforseo.com/v3
```

**Quando usar cada valor:**

| Ambiente | `DATAFORSEO_BASE_URL` | Custo | Dados |
|---|---|---|---|
| Dev / CI / smoke tests | `https://sandbox.dataforseo.com/v3` | Grátis, ilimitado | Dummy (mesma estrutura) |
| Produção | omitir, ou `https://api.dataforseo.com/v3` | Cobrado por página de 100 resultados | Reais |

> Sandbox **requer credenciais válidas da conta DataForSEO** (não aceita
> credenciais arbitrárias). Se sua conta está bloqueada ou sem depósito,
> ative `DATAFORSEO_LOGIN`/`PASSWORD` antes de testar. Veja
> `backend/scripts/smoke_test_dataforseo.py` pra um teste runnable.

### 🔀 **Fonte de descoberta de leads (`LEAD_SOURCE`) + Scrappa (dev/teste):**

```bash
# Qual provedor usar na descoberta de leads (Google Maps).
#   dataforseo (default) → fonte canônica de produção (ver ADR-002)
#   scrappa              → alternativa de DEV/TESTE (tier grátis recorrente)
LEAD_SOURCE=dataforseo

# Só necessária quando LEAD_SOURCE=scrappa. Chave em scrappa.co/dashboard.
SCRAPPA_API_KEY=
```

**Quando usar cada fonte:**

| `LEAD_SOURCE` | Env extra | Uso | Limite por busca | Grátis |
|---|---|---|---|---|
| `dataforseo` (default) | `DATAFORSEO_LOGIN`/`PASSWORD` | Produção | `depth=700` numa chamada | — |
| `scrappa` | `SCRAPPA_API_KEY` | Dev/teste | até 200 results/request | **500/mês recorrente** |

> **Scrappa é fonte de dev/teste, não de produção.** O ADR-002 mantém o
> DataForSEO como canônico; o Scrappa foi plugado só para desenvolver sem
> depender da conta DataForSEO (travada por verificação BR).
>
> - **Scrappa** (`scrappa.co`): 1 crédito/request, **até 200 resultados numa
>   request** (param `limit`), **500 créditos/mês recorrente** grátis — melhor
>   pra ambiente de teste durável. Teste: `backend/scripts/smoke_test_scrappa.py`.

### ✉️ **Email enrichment providers (toggles opcionais — default: todos `true`):**

```bash
# Cada provider pode ser desligado individualmente sem deploy de código
ENABLE_DATAFORSEO_CONTACT_URL_PROVIDER=true
ENABLE_RECEITA_FEDERAL_PROVIDER=true
ENABLE_FIRECRAWL_SEARCH_PROVIDER=true
ENABLE_FIRECRAWL_MAP_SCRAPE_PROVIDER=true

# Firecrawl base URL (raramente muda — só pra testes contra instância self-hosted)
FIRECRAWL_BASE_URL=https://api.firecrawl.dev/v1

# BrasilAPI base URL (mirror/teste — raramente muda)
BRASIL_API_CNPJ_BASE=https://brasilapi.com.br/api/cnpj/v1

# TTL do cache global por domínio (migration v9, PR 4)
# Cache hit dentro deste TTL = $0 Firecrawl. Aumentar reduz custo, diminuir
# aumenta freshness. 30 é o sweet spot pra leads B2B brasileiros.
EMAIL_CACHE_TTL_DAYS=30
```

---

## 🎨 FRONTEND (React + Vite)

### ✅ **OBRIGATÓRIAS:**

```bash
# URL do Backend
VITE_BACKEND_URL=https://seu-dominio-backend.com/api

# Feature flag: módulo de Campanhas de Email (manter sincronizado com
# ENABLE_CAMPAIGNS do backend). Vite resolve no BUILD, não em runtime —
# mudou? rebuild + redeploy. Default "false".
VITE_ENABLE_CAMPAIGNS=false
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

### **2. DataForSEO (busca de leads):**
- Acesse: https://app.dataforseo.com
- `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`: credenciais da API

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

### **Busca de leads falha:**
- Verificar `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`
- Verificar saldo/ativação da conta DataForSEO

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
