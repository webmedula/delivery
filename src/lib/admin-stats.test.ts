import { describe, expect, it } from "vitest";
import { summarizeStores } from "./admin-stats";

const now = new Date("2026-11-13T12:00:00Z");
const day = 86400000;
const base = { trialEndsAt: null, currentPeriodEnd: null, blockedAt: null };

describe("summarizeStores", () => {
  it("conta por situação e soma a receita só das ativas", () => {
    const s = summarizeStores(
      [
        { ...base, subscriptionStatus: "ACTIVE", plan: { priceCents: 4990 } },
        { ...base, subscriptionStatus: "ACTIVE", plan: { priceCents: 14990 } },
        { ...base, subscriptionStatus: "ACTIVE", blockedAt: now, plan: { priceCents: 8990 } },
        { ...base, subscriptionStatus: "TRIALING", trialEndsAt: new Date(+now + day), plan: { priceCents: 4990 } },
        { ...base, subscriptionStatus: "TRIALING", trialEndsAt: new Date(+now - day), plan: { priceCents: 4990 } },
        { ...base, subscriptionStatus: "PAST_DUE", plan: { priceCents: 4990 } },
        { ...base, subscriptionStatus: "CANCELED", plan: { priceCents: 4990 } },
      ],
      now,
    );
    expect(s.total).toBe(7);
    expect(s.bySituation).toEqual({ ACTIVE: 2, BLOCKED: 1, TRIAL: 1, TRIAL_EXPIRED: 1, PAST_DUE: 1, CANCELED: 1 });
    expect(s.mrrCents).toBe(19980);
  });
});
