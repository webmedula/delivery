// Ponto único de integração com o gateway de cobrança recorrente.
// Ainda não implementado. Opções avaliadas para o Brasil: Asaas (Pix + boleto +
// cartão recorrente), Mercado Pago (assinaturas) ou Stripe (cartão; Pix limitado).
//
// Fluxo previsto:
// 1. createCheckout(storeId, planCode) -> cria cliente/assinatura no gateway e devolve URL de pagamento.
// 2. Webhook /api/billing/webhook -> ao confirmar pagamento, marca Store como ACTIVE
//    e atualiza currentPeriodEnd; em atraso, PAST_DUE; em cancelamento, CANCELED.
// O bloqueio da loja já respeita esses estados (ver src/lib/subscription.ts).

export async function createCheckout(_storeId: string, _planCode: string): Promise<{ url: string }> {
  throw new Error("Gateway de cobrança ainda não configurado.");
}
