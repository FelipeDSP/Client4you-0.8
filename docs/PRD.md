# Client4You / Lead Dispatcher - PRD (Product Requirements Document)

## 📋 Visão Geral
Plataforma SaaS para captação e conversão de leads via WhatsApp.

**Stack Técnico:**
- Frontend: React + TypeScript + Vite + TailwindCSS + Shadcn/UI
- Backend: FastAPI (Python)
- Banco de Dados: Supabase (PostgreSQL)
- Integração WhatsApp: WAHA (WhatsApp HTTP API)
- Pagamentos: Kiwify (webhooks)

---

## 👥 User Personas

### 1. Empreendedor/Vendedor (Usuário Final)
- Busca leads qualificados para seu negócio
- Precisa de ferramenta para disparar mensagens em massa
- Quer automatizar atendimento inicial

### 2. Administrador da Plataforma
- Gerencia usuários e planos
- Monitora uso do sistema
- Suspende/ativa contas manualmente

---

## 🎯 Core Requirements (Estáticos)

### Funcionalidades Principais
1. **Extrator de Leads** - Busca leads do Google Maps por segmento/localização
2. **Disparador WhatsApp** - Envio de mensagens em massa com intervalos
3. **Agente IA** - Resposta automática inteligente (em desenvolvimento)
4. **Gestão de Campanhas** - Criar, pausar, cancelar campanhas
5. **Dashboard** - Métricas em tempo real

### Sistema de Planos (SEM DEMO)
| Plano | Leads | Disparador | Agente IA | Preço |
|-------|-------|------------|-----------|-------|
| Básico | Ilimitado | ❌ | ❌ | R$ 39,90/mês |
| Intermediário | Ilimitado | ✅ Ilimitado | ❌ | R$ 99,90/mês |
| Avançado | Ilimitado | ✅ Ilimitado | ✅ | R$ 199,90/mês |

### Status de Conta
- **active**: Conta funcionando normalmente
- **suspended**: Conta suspensa (cancelamento/não pagamento/admin)
- **expired**: Plano expirou sem renovação

---

## ✅ O que foi Implementado (06/02/2026)

### Controle de Acesso por Plano (ATUALIZADO)
- [x] Plano Demo REMOVIDO completamente
- [x] Hook `usePlanPermissions` - verifica permissões e status da conta
- [x] Componente `PlanBlockedOverlay` - tela de bloqueio para conta suspensa/expirada
- [x] Verificação de expiração de plano no backend (HTTP 402)
- [x] Sidebar com ícones de cadeado para features bloqueadas
- [x] Alerta de expiração próxima no Dashboard

### Painel Admin - Gerenciamento Manual
- [x] Endpoint `POST /api/admin/users/{id}/suspend` - suspende conta
- [x] Endpoint `POST /api/admin/users/{id}/activate` - ativa com plano escolhido
- [x] Endpoint `GET /api/admin/users` - lista todos usuários com status
- [x] Interface no Admin com botões Suspender/Ativar
- [x] Coluna de Status (Ativo/Suspenso/Expirado) na tabela

### Página Agente IA
- [x] Página criada (`/agente-ia`)
- [x] Configurações de personalidade e prompt
- [x] Status: Beta (integração n8n pendente)

### Sidebar Reorganizada
- [x] "Buscar Leads" movido para seção "Ferramentas"
- [x] Seções: Aplicação (Dashboard, Histórico) | Ferramentas (Buscar Leads, Disparador, Agente IA) | Conta

### Configurações de Campanha MELHORADAS
- [x] Seleção de Fuso Horário por campanha (6 fusos brasileiros)
- [x] Presets de horário: Comercial, Manhã, Tarde, Dia Inteiro
- [x] Visualização gráfica da janela de disparo (barra visual 0-24h)
- [x] Estimativa de capacidade (msg/hora, msg/dia)
- [x] Badges de risco no limite diário (Seguro → Alto Risco)
- [x] Tooltips explicativos nos dias da semana
- [x] Backend atualizado para usar timezone da campanha

### Configurações Simplificadas
- [x] Removida configuração de timezone/horários globais (agora é por campanha)
- [x] Página de Configurações mostra mensagem informativa sobre horários por campanha
- [x] Cada campanha define seu próprio fuso horário e horários de envio

### Criar Campanha Direto dos Leads (NOVO)
- [x] Botão "Criar Campanha" na página de busca de leads
- [x] Dialog com configurações rápidas (timezone, horário, dias, limite)
- [x] Endpoint `POST /api/campaigns/from-leads` - cria campanha + contatos em uma chamada
- [x] Inserção em batch de contatos (500 por vez) para não sobrecarregar Supabase
- [x] Filtro automático: só leads com WhatsApp são adicionados
- [x] Estimativa de tempo de conclusão da campanha

### Correção de Dias da Semana
- [x] Corrigida conversão JS (0=Dom) → Python (0=Seg) no campaign_worker
- [x] Agora os horários funcionam corretamente com qualquer fuso horário

### Sistema de Pagamentos (Kiwify)
- [x] Webhook `order.paid` - upgrade automático
- [x] Webhook `order.refunded` - SUSPENDE conta
- [x] Webhook `subscription.canceled` - SUSPENDE conta

---

## 📊 Sobre Company vs User

**Status atual:** Cada usuário tem sua própria Company (relação 1:1)

**Motivo original:** Permitir times com múltiplos usuários por empresa

**Recomendação:** Manter por enquanto - simplificar envolveria migração de dados no Supabase

---

## 📝 Backlog Priorizado

### P0 (Crítico)
- [ ] Integração n8n para Agente IA
- [ ] Webhook de renovação mensal do Kiwify

### P1 (Importante)  
- [ ] Página de preços/planos pública
- [ ] Histórico de pagamentos no perfil
- [ ] Notificação por email antes de expirar

### P2 (Melhoria)
- [ ] Simplificar relação Company/User
- [ ] Job automático de expiração de planos
- [ ] Relatórios exportáveis

---

## 🔗 Links de Pagamento (Kiwify)
- Básico: https://pay.kiwify.com.br/FzhyShi
- Intermediário: https://pay.kiwify.com.br/YlIDqCN
- Avançado: https://pay.kiwify.com.br/TnUQl3f

---

## 🧪 Como Testar

### Testar Suspensão via Admin:
1. Acesse `/admin` (requer role super_admin)
2. Encontre o usuário na lista
3. Clique em "Suspender" → Confirme
4. A conta do usuário ficará com status "Suspenso"
5. Usuário verá tela de bloqueio ao acessar qualquer página

### Testar Ativação via Admin:
1. Encontre usuário suspenso
2. Clique em "Ativar" → Escolha plano (Básico/Intermediário/Avançado)
3. Conta ativada por 30 dias com o plano escolhido
