import type { SubscriptionStatus } from "@prisma/client";

export const TRIAL_DAYS = 14;
/** Dias de tolerância depois do vencimento antes de bloquear a loja. */
export const GRACE_DAYS = 3;

type StoreBilling = {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  blockedAt?: Date | null;
};

const DAY = 24 * 60 * 60 * 1000;

/** A loja pode receber pedidos? */
export function canTakeOrders(store: StoreBilling, now = new Date()): boolean {
  if (store.blockedAt) return false;
  // trialEndsAt é "acesso liberado até": vale para o teste inicial e para
  // dias de cortesia que o administrador concede, em qualquer situação.
  if (store.trialEndsAt && store.trialEndsAt.getTime() > now.getTime()) return true;
  switch (store.subscriptionStatus) {
    case "TRIALING":
      return false;
    case "ACTIVE":
      return true;
    case "PAST_DUE":
      return !!store.currentPeriodEnd && store.currentPeriodEnd.getTime() + GRACE_DAYS * DAY > now.getTime();
    case "CANCELED":
      // Cancelou, mas ainda usa o que já pagou.
      return !!store.currentPeriodEnd && store.currentPeriodEnd.getTime() > now.getTime();
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

export type StoreSituation = "BLOCKED" | "TRIAL" | "TRIAL_EXPIRED" | "ACTIVE" | "PAST_DUE" | "CANCELED";

/** Situação da loja como o administrador precisa ver (uma só palavra por loja). */
export function storeSituation(store: StoreBilling, now = new Date()): StoreSituation {
  if (store.blockedAt) return "BLOCKED";
  switch (store.subscriptionStatus) {
    case "TRIALING":
      return canTakeOrders(store, now) ? "TRIAL" : "TRIAL_EXPIRED";
    case "ACTIVE":
      return "ACTIVE";
    case "PAST_DUE":
      return "PAST_DUE";
    case "CANCELED":
      return "CANCELED";
  }
}

export const situationLabel: Record<StoreSituation, string> = {
  BLOCKED: "Bloqueada",
  TRIAL: "Em teste",
  TRIAL_EXPIRED: "Teste vencido",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento pendente",
  CANCELED: "Cancelada",
};
