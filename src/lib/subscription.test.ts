import { describe, expect, it } from "vitest";
import { canTakeOrders, trialDaysLeft } from "./subscription";

const now = new Date("2026-11-12T12:00:00Z");
const day = 86400000;

describe("canTakeOrders", () => {
  it("teste válido libera, teste vencido bloqueia", () => {
    expect(canTakeOrders({ subscriptionStatus: "TRIALING", trialEndsAt: new Date(+now + day), currentPeriodEnd: null }, now)).toBe(true);
    expect(canTakeOrders({ subscriptionStatus: "TRIALING", trialEndsAt: new Date(+now - day), currentPeriodEnd: null }, now)).toBe(false);
  });
  it("pagamento atrasado tem 3 dias de tolerância", () => {
    expect(canTakeOrders({ subscriptionStatus: "PAST_DUE", trialEndsAt: null, currentPeriodEnd: new Date(+now - 2 * day) }, now)).toBe(true);
    expect(canTakeOrders({ subscriptionStatus: "PAST_DUE", trialEndsAt: null, currentPeriodEnd: new Date(+now - 4 * day) }, now)).toBe(false);
  });
  it("cancelada bloqueia, mas só depois do período já pago", () => {
    expect(canTakeOrders({ subscriptionStatus: "CANCELED", trialEndsAt: null, currentPeriodEnd: null }, now)).toBe(false);
    expect(canTakeOrders({ subscriptionStatus: "CANCELED", trialEndsAt: null, currentPeriodEnd: new Date(+now + 5 * day) }, now)).toBe(true);
    expect(canTakeOrders({ subscriptionStatus: "CANCELED", trialEndsAt: null, currentPeriodEnd: new Date(+now - day) }, now)).toBe(false);
  });
  it("conta dias de teste restantes", () => {
    expect(trialDaysLeft({ subscriptionStatus: "TRIALING", trialEndsAt: new Date(+now + 13.2 * day), currentPeriodEnd: null }, now)).toBe(14);
  });
});
