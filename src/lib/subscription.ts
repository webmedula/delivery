import type { SubscriptionStatus } from "@prisma/client";

export const TRIAL_DAYS = 14;
/** Dias de tolerância depois do vencimento antes de bloquear a loja. */
export const GRACE_DAYS = 3;

type StoreBilling = {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

const DAY = 24 * 60 * 60 * 1000;

/** A loja pode receber pedidos? */
export function canTakeOrders(store: StoreBilling, now = new Date()): boolean {
  switch (store.subscriptionStatus) {
    case "TRIALING":
      return !!store.trialEndsAt && store.trialEndsAt.getTime() > now.getTime();
    case "ACTIVE":
      return true;
    case "PAST_DUE":
      return !!store.currentPeriodEnd && store.currentPeriodEnd.getTime() + GRACE_DAYS * DAY > now.getTime();
    case "CANCELED":
      // Cancelou, mas ainda usa o que já pagou (ou o resto do teste).
      return (
        (!!store.currentPeriodEnd && store.currentPeriodEnd.getTime() > now.getTime()) ||
        (!!store.trialEndsAt && store.trialEndsAt.getTime() > now.getTime())
      );
  }
}

export function trialDaysLeft(store: StoreBilling, now = new Date()): number {
  if (store.subscriptionStatus !== "TRIALING" || !store.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((store.trialEndsAt.getTime() - now.getTime()) / DAY));
}

export const statusLabel: Record<SubscriptionStatus, string> = {
  TRIALING: "Período de teste",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento pendente",
  CANCELED: "Cancelada",
};
