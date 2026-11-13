import { describe, expect, it } from "vitest";
import { canTakeOrders, storeSituation, trialDaysLeft } from "./subscription";

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
  it("dias de cortesia liberam loja com pagamento pendente", () => {
    const late = { subscriptionStatus: "PAST_DUE" as const, currentPeriodEnd: new Date(+now - 10 * day) };
    expect(canTakeOrders({ ...late, trialEndsAt: null }, now)).toBe(false);
    expect(canTakeOrders({ ...late, trialEndsAt: new Date(+now + 3 * day) }, now)).toBe(true);
  });
  it("bloqueio manual vence qualquer situação", () => {
    const active = { subscriptionStatus: "ACTIVE" as const, trialEndsAt: null, currentPeriodEnd: new Date(+now + 20 * day) };
    expect(canTakeOrders({ ...active, blockedAt: new Date() }, now)).toBe(false);
    expect(storeSituation({ ...active, blockedAt: new Date() }, now)).toBe("BLOCKED");
    expect(storeSituation(active, now)).toBe("ACTIVE");
    expect(storeSituation({ subscriptionStatus: "TRIALING", trialEndsAt: new Date(+now - day), currentPeriodEnd: null }, now)).toBe("TRIAL_EXPIRED");
  });
});
