// Tradução dos eventos do Asaas (webhook da subconta da loja ou consulta direta
// da cobrança) para a situação do pagamento online do pedido.
// Funções puras, para testar sem banco nem rede.

import type { OrderStatus, PaymentStatus } from "@prisma/client";

export type OrderPaymentState = { paymentStatus: PaymentStatus; status: OrderStatus };
export type OrderPaymentUpdate = { paymentStatus: PaymentStatus; status?: OrderStatus; paidAt?: Date };

export function paymentUpdateFor(event: string, order: OrderPaymentState, now = new Date()): OrderPaymentUpdate | null {
  switch (event) {
    // Cartão chega como CONFIRMED; Pix como RECEIVED.
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") return null;
      // Pagou depois que a cobrança venceu e o pedido foi cancelado: o pedido volta para a loja.
      if (order.paymentStatus === "EXPIRED" && order.status === "CANCELED")
        return { paymentStatus: "PAID", paidAt: now, status: "PENDING" };
      return { paymentStatus: "PAID", paidAt: now };
    case "PAYMENT_OVERDUE":
    case "PAYMENT_DELETED":
      if (order.paymentStatus !== "AWAITING") return null;
      return { paymentStatus: "EXPIRED", status: "CANCELED" };
    case "PAYMENT_REFUNDED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
      if (order.paymentStatus === "REFUNDED") return null;
      return { paymentStatus: "REFUNDED" };
    default:
      return null;
  }
}

/** Situação de uma cobrança consultada na API -> evento equivalente do webhook. */
export function eventForPaymentStatus(status: string): string | null {
  switch (status) {
    case "CONFIRMED":
      return "PAYMENT_CONFIRMED";
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return "PAYMENT_RECEIVED";
    case "OVERDUE":
      return "PAYMENT_OVERDUE";
    case "REFUNDED":
    case "CHARGEBACK_REQUESTED":
      return "PAYMENT_REFUNDED";
    default:
      return null;
  }
}

export const accountStatusLabel: Record<string, string> = {
  PENDING: "Pendente",
  AWAITING_APPROVAL: "Em análise",
  APPROVED: "Aprovada",
  REJECTED: "Recusada",
};

/**
 * A loja pode ligar o pagamento online? Em produção, só com a conta aprovada
 * pelo Asaas. No sandbox libera antes, para dar para testar.
 */
export function canEnableOnlinePayments(store: { asaasApiKeyEnc: string | null; asaasAccountStatus: string | null }, sandbox: boolean) {
  if (!store.asaasApiKeyEnc) return false;
  return sandbox || store.asaasAccountStatus === "APPROVED";
}

/** Valor mínimo de uma cobrança no Asaas. */
export const MIN_ONLINE_PAYMENT_CENTS = 500;

/** Eventos que o webhook da subconta precisa receber. */
export const SUBACCOUNT_WEBHOOK_EVENTS = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
];
