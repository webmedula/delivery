import { describe, expect, it } from "vitest";
import { commissionCents, normalizePartnerCode, suggestPartnerCode, summarizePartner } from "./partner";

const now = new Date("2026-11-23T12:00:00Z");
const day = 86400000;
const store = (over: Partial<Parameters<typeof summarizePartner>[0][number]> = {}) => ({
  subscriptionStatus: "ACTIVE" as const,
  trialEndsAt: null,
  currentPeriodEnd: new Date(+now + 10 * day),
  blockedAt: null,
  plan: { priceCents: 8990 },
  ...over,
});

describe("código do parceiro", () => {
  it("tira acento, espaço e símbolo e põe em maiúsculas", () => {
    expect(normalizePartnerCode(" joão-silva ")).toBe("JOAOSILVA");
    expect(normalizePartnerCode("Agência 2B!")).toBe("AGENCIA2B");
    expect(normalizePartnerCode(null)).toBe("");
    expect(normalizePartnerCode("a".repeat(30))).toHaveLength(20);
  });
  it("sugere o primeiro nome, ou o nome todo se o primeiro for curto", () => {
    expect(suggestPartnerCode("Maria Souza Design")).toBe("MARIA");
    expect(suggestPartnerCode("JP Social Media")).toBe("JPSOCIALMEDIA");
  });
});

describe("comissão", () => {
  it("30% de R$ 89,90 dá R$ 26,97", () => {
    expect(commissionCents(8990, 30)).toBe(2697);
    expect(commissionCents(4990, 30)).toBe(1497);
  });
  it("conta só as lojas pagando; teste, atraso, cancelada, bloqueada e demo ficam fora", () => {
    const s = summarizePartner(
      [
        store(),
        store({ plan: { priceCents: 4990 } }),
        store({ subscriptionStatus: "TRIALING", trialEndsAt: new Date(+now + 5 * day), currentPeriodEnd: null }),
        store({ subscriptionStatus: "PAST_DUE", currentPeriodEnd: new Date(+now - day) }),
        store({ subscriptionStatus: "CANCELED", currentPeriodEnd: new Date(+now - day) }),
        store({ blockedAt: new Date(+now - day) }),
        store({ isDemo: true }),
      ],
      30,
      now,
    );
    expect(s).toEqual({ total: 6, paying: 2, trial: 1, monthlyCents: 13980, commissionCents: 2697 + 1497 });
  });
});
