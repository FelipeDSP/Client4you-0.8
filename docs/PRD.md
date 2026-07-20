# Client4You — PRD (Product Requirements Document)

> Atualizado em 2026-06-09 para refletir o produto real. O WhatsApp/WAHA, o
> Agente IA e o plano "Avançado" foram **removidos** (migrations
> `migration_clean_v2_remove_agente.sql` e `migration_clean_v3_remove_whatsapp.sql`).
> As Campanhas de Email existem no código mas ficam **desligadas** por padrão via
> flag `ENABLE_CAMPAIGNS` — ver `docs/FEATURE_FLAGS.md`.

## 📋 Visão Geral
Plataforma SaaS de **prospecção de leads B2B brasileiros**: descoberta de
empresas no Google Maps + enriquecimento de e-mail/CNPJ/metadados da Receita
Federal.

**Stack Técnico:**
- Frontend: React + TypeScript + Vite + TailwindCSS + Shadcn/UI
- Backend: FastAPI (Python), 1 worker uvicorn (precondição — ver TECH_DEBT.md#3)
- Banco de Dados: Supabase (PostgreSQL + RLS + Auth)
- Descoberta de leads: DataForSEO (Google Maps)
- Enrichment de e-mail: cascata de providers (DataForSEO contact_url → Firecrawl
  search → Firecrawl map scrape → Receita Federal via BrasilAPI) + cache global
  por domínio
- Pagamentos: Kiwify (webhooks)

---

## 👥 User Personas

### 1. Empreendedor/Vendedor (Usuário Final)
- Busca leads qualificados por segmento e localização
- Enriquece os leads com e-mail e dados cadastrais (CNPJ/Receita)
- Exporta a base para usar no seu próprio fluxo de prospecção

### 2. Administrador da Plataforma
- Gerencia usuários e planos
- Monitora uso do sistema (quotas, telemetria de enrichment)
- Suspende/ativa contas manualmente

---

## 🎯 Funcionalidades Principais
1. **Busca de Leads** — Google Maps via DataForSEO, server-side, com quota por lead.
2. **Enriquecimento de E-mail** — cascata de providers + cache global por domínio
   (síncrono e assíncrono via fila).
3. **CNPJ / Receita Federal** — extração passiva no scrape + input manual com
   validação de dígito verificador; metadados (razão social, CNAE, situação…).
4. **Base de Leads** — leads salvos explicitamente (`saved_at`), exportação CSV.
5. **Dashboard** — métricas de uso.
6. **(Desligado) Campanhas de Email** — código preservado atrás de `ENABLE_CAMPAIGNS=false`.

### Sistema de Planos
Fonte única: `backend/plans.py`. Limites são chute conservador inicial — recalibrar
com custo real de Firecrawl (TECH_DEBT.md#9).

| Plano | Leads/mês | Enrichment/mês | Reenriquecer/mês |
|-------|-----------|----------------|------------------|
| Demo | 50 | 50 | 0 |
| Básico | 500 | 500 | 0 |
| Intermediário | 2000 | 2000 | 10 |

> `leads_limit` nunca é ilimitado (-1) — a API de descoberta é paga por
> resultado, então ilimitado = prejuízo garantido.

### Status de Conta (valores reais)
- **active**: gravado no upgrade (`order.paid`).
- **suspended**: gravado em `order.refunded` / `subscription.canceled` ou via admin.
- **expired**: computado quando não há subscription ativa.

---

## 💳 Sistema de Pagamentos (Kiwify)
- Webhook `order.paid` → cria conta (se nova) + upgrade de plano (status `active`).
- Webhook `order.refunded` → suspende conta (`suspended`).
- Webhook `subscription.canceled` → suspende conta (`suspended`).
- Assinatura verificada via HMAC-SHA256 (`X-Kiwify-Signature`).

---

## 📊 Company vs User
Cada usuário tem sua própria Company (relação 1:1). Mantido por enquanto;
simplificar envolveria migração de dados no Supabase.

---

## 📝 Backlog Priorizado

### P0 (Crítico)
- [ ] Aplicar migration v14 (`increment_quota_atomic`) no banco
- [ ] Fechar achados críticos de segurança/inconsistência (ver auditorias)
- [ ] Webhook de renovação mensal do Kiwify (idempotência por `order_id`)

### P1 (Importante)
- [ ] Página de preços/planos pública
- [ ] Recalibrar limites de plano com custo real de Firecrawl (TECH_DEBT#9)
- [ ] Notificação por e-mail antes de expirar

### P2 (Melhoria)
- [ ] Baseline versionado do schema (TECH_DEBT#1)
- [ ] Job automático de expiração de planos
- [ ] Decidir reativação (ou remoção) das Campanhas de Email

---

## 🔗 Links de Pagamento (Kiwify)
- Básico: https://pay.kiwify.com.br/FzhyShi
- Intermediário: https://pay.kiwify.com.br/YlIDqCN

---

## 🧪 Como Testar (Admin)

### Suspensão via Admin
1. Acesse `/admin` (requer role super_admin)
2. Encontre o usuário → "Suspender" → confirme
3. Status vira "Suspenso"

### Ativação via Admin
1. Encontre o usuário suspenso → "Ativar" → escolha o plano (Básico/Intermediário)
2. Conta ativada por 30 dias com o plano escolhido
