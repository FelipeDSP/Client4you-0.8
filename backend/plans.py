"""
Plans — single source of truth for plan capabilities and Kiwify product mapping.

Após o reset cirúrgico do schema, os LIMITES vivem aqui (não no banco).
`subscriptions.plan_id` é o ponteiro pro plano; este módulo expõe o que cada
plano pode fazer.
"""
from typing import Dict, Any


# Mapeamento de nome do produto Kiwify → plan_id canônico
PLAN_NAME_MAP: Dict[str, str] = {
    'básico': 'basico',
    'basico': 'basico',
    'intermediário': 'intermediario',
    'intermediario': 'intermediario',
}


# Limites por plano. -1 = ilimitado, 0 = não disponível.
#
# IMPORTANTE (modelo DataForSEO, pago-por-uso):
#   leads_limit conta LEADS extraídos/mês — não buscas. O backend incrementa
#   `leads_used` pelo nº de leads realmente inseridos e capa a profundidade da
#   busca pela quota restante. Por isso `leads_limit` NÃO deve ser -1 (ilimitado
#   = prejuízo garantido com API paga por resultado). A cobrança do DataForSEO
#   é por página de 100 resultados, então mantenha múltiplos de 100.
# `email_enrichment_limit` = teto mensal de tentativas de enrichment (cache hit
# OU miss conta). Política atual: igual ao `leads_limit` (todo lead extraído
# pode ser enriquecido 1x). Cache global por domínio absorve a maior parte do
# custo Firecrawl em batches reais.
#
# `reenrich_limit` = sub-quota separada do botão "Reenriquecer" (PR 6). Esse
# fluxo FORÇA bypass do cache → sempre gasta Firecrawl. Limitado agressivamente
# (10/mês no plano top, 0 nos outros) porque é cenário always-miss.
#
# Os números abaixo são chute conservador inicial. Recalibrar com dados reais
# de custo Firecrawl em produção — ver docs/TECH_DEBT.md#9.
PLAN_LIMITS: Dict[str, Dict[str, Any]] = {
    'demo': {
        'name': 'Demo',
        'leads_limit': 50,
        'email_enrichment_limit': 50,
        'reenrich_limit': 0,
        'campaigns_limit': 1,
        'messages_limit': 50,
    },
    'basico': {
        'name': 'Plano Básico',
        'leads_limit': 500,
        'email_enrichment_limit': 500,
        'reenrich_limit': 0,
        'campaigns_limit': 0,
        'messages_limit': 0,
    },
    'intermediario': {
        'name': 'Plano Intermediário',
        'leads_limit': 2000,
        'email_enrichment_limit': 2000,
        'reenrich_limit': 10,
        'campaigns_limit': -1,
        'messages_limit': -1,
    },
}


# Quando a subscription está suspensa/cancelada/expirada, zeramos tudo
# independente do plan_id. Esse override garante consistência.
SUSPENDED_LIMITS: Dict[str, Any] = {
    'name': 'Conta Suspensa',
    'leads_limit': 0,
    'email_enrichment_limit': 0,
    'reenrich_limit': 0,
    'campaigns_limit': 0,
    'messages_limit': 0,
}


def get_plan_limits(plan_id: str, subscription_status: str = 'active') -> Dict[str, Any]:
    """
    Retorna os limites efetivos do plano, considerando o status da subscription.

    - Se a subscription estiver suspensa/cancelada/expirada → SUSPENDED_LIMITS.
    - Se o plan_id for desconhecido → SUSPENDED_LIMITS (fail-closed).
    - Caso contrário, retorna PLAN_LIMITS[plan_id].
    """
    if subscription_status in ('suspended', 'cancelled', 'expired'):
        return SUSPENDED_LIMITS
    return PLAN_LIMITS.get(plan_id, SUSPENDED_LIMITS)
