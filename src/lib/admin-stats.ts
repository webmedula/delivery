// Números da visão geral do administrador. Função pura para poder testar.

import type { SubscriptionStatus } from "@prisma/client";
import { storeSituation, type StoreSituation } from "./subscription";

type StoreRow = {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  blockedAt: Date | null;
  plan: { priceCents: number };
};

export function summarizeStores(stores: StoreRow[], now = new Date()) {
  const bySituation: Record<StoreSituation, number> = {
    BLOCKED: 0, TRIAL: 0, TRIAL_EXPIRED: 0, ACTIVE: 0, PAST_DUE: 0, CANCELED: 0,
  };
  let mrrCents = 0;
  for (const store of stores) {
    const situation = storeSituation(store, now);
    bySituation[situation]++;
    // Receita mensal prevista: só quem está com a assinatura em dia.
    if (situation === "ACTIVE") mrrCents += store.plan.priceCents;
  }
  return { total: stores.length, bySituation, mrrCents };
}
