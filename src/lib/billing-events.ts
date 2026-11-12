// Tradução dos eventos de webhook do Asaas para o estado da assinatura da loja.
// Função pura, para poder testar sem banco nem rede.

import type { SubscriptionStatus } from "@prisma/client";

export type AsaasWebhook = {
  id?: string;
  event: string;
  payment?: { id: string; subscription?: string; customer?: string; dueDate?: string; externalReference?: string | null };
  subscription?: { id: string; externalReference?: string | null };
};

export type BillingUpdate = {
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd?: Date;
  clearSubscription?: boolean;
};

/** "2026-11-12" + 1 mês, ao meio-dia UTC para não escorregar de dia por fuso. */
export function addOneMonth(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const lastDayNextMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDayNextMonth), 12));
}

function atNoon(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function billingUpdateFor(event: AsaasWebhook, current: { currentPeriodEnd: Date | null }): BillingUpdate | null {
  const due = event.payment?.dueDate;
  switch (event.event) {
    // Cartão confirma antes de liquidar; Pix e boleto chegam como RECEIVED.
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      if (!due) return null;
      const end = addOneMonth(due);
      // Não encurta um período já pago (ex.: evento antigo chegando atrasado).
      if (current.currentPeriodEnd && current.currentPeriodEnd > end) return { subscriptionStatus: "ACTIVE" };
      return { subscriptionStatus: "ACTIVE", currentPeriodEnd: end };
    }
    case "PAYMENT_OVERDUE":
      if (!due) return null;
      // Um atraso de fatura antiga não derruba quem já pagou um período posterior.
      if (current.currentPeriodEnd && current.currentPeriodEnd > addOneMonth(due)) return null;
      return { subscriptionStatus: "PAST_DUE", currentPeriodEnd: atNoon(due) };
    case "PAYMENT_REFUNDED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
      return { subscriptionStatus: "PAST_DUE", currentPeriodEnd: new Date(0) };
    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED":
      return { subscriptionStatus: "CANCELED", clearSubscription: true };
    default:
      return null;
  }
}
