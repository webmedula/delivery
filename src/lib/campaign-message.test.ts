import { describe, expect, it } from "vitest";
import { inAudience, OPT_OUT_LINE, renderCampaignMessage } from "./campaign-message";

describe("renderCampaignMessage", () => {
  it("troca as variáveis e adiciona a linha de descadastro", () => {
    const text = renderCampaignMessage("Oi {nome}! Na {loja} use {CUPOM}: {link}", {
      name: "Maria Souza", store: "Lanchonete", link: "https://x/loja/a", coupon: "VOLTA15",
    });
    expect(text).toBe(`Oi Maria! Na Lanchonete use VOLTA15: https://x/loja/a\n\n${OPT_OUT_LINE}`);
  });
  it("não duplica a linha de descadastro", () => {
    const t = renderCampaignMessage(`Oi\n\n${OPT_OUT_LINE}`, { name: "A", store: "B", link: "" });
    expect(t.split(OPT_OUT_LINE).length).toBe(2);
  });
});

describe("inAudience", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const base = { orders: 3, lastOrderAt: new Date("2026-11-10T12:00:00Z"), stamps: 2, rewardAvailable: false };
  const o = { inactiveDays: 30, ordersRequired: 5, now };
  it("sumidos", () => {
    expect(inAudience(base, "inactive", o)).toBe(false);
    expect(inAudience({ ...base, lastOrderAt: new Date("2026-10-01T12:00:00Z") }, "inactive", o)).toBe(true);
    expect(inAudience({ ...base, lastOrderAt: null }, "inactive", o)).toBe(false);
  });
  it("pediram uma vez", () => {
    expect(inAudience({ ...base, orders: 1 }, "new", o)).toBe(true);
    expect(inAudience(base, "new", o)).toBe(false);
  });
  it("perto da recompensa", () => {
    expect(inAudience({ ...base, stamps: 4 }, "reward", o)).toBe(true);
    expect(inAudience({ ...base, stamps: 5, rewardAvailable: true }, "reward", o)).toBe(true);
    expect(inAudience(base, "reward", o)).toBe(false);
    expect(inAudience({ ...base, stamps: null }, "reward", o)).toBe(false);
  });
});
