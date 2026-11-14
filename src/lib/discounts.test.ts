import { describe, expect, it } from "vitest";
import { checkCoupon, discountCents, loyaltyStatus, normalizeCouponCode, type CouponRules } from "./discounts";
import { normalizePhone, isValidPhone, formatPhone } from "./phone";

const base: CouponRules = {
  type: "PERCENT", value: 10, active: true, expiresAt: null, minOrderCents: 0, maxUses: 0, oncePerCustomer: true, firstOrderOnly: false,
};
const noUse = { totalUses: 0, customerUses: 0, customerOrders: 0 };

describe("discountCents", () => {
  it("calcula porcentagem e valor fixo", () => {
    expect(discountCents(5000, { type: "PERCENT", value: 10 })).toBe(500);
    expect(discountCents(5000, { type: "FIXED", value: 700 })).toBe(700);
  });
  it("nunca passa do subtotal", () => {
    expect(discountCents(500, { type: "FIXED", value: 700 })).toBe(500);
    expect(discountCents(500, { type: "PERCENT", value: 150 })).toBe(500);
  });
});

describe("checkCoupon", () => {
  it("aceita cupom válido", () => {
    expect(checkCoupon(base, noUse, 3000)).toEqual({ ok: true, discountCents: 300 });
  });
  it("recusa inativo, expirado e esgotado", () => {
    expect(checkCoupon({ ...base, active: false }, noUse, 3000).ok).toBe(false);
    expect(checkCoupon({ ...base, expiresAt: new Date("2020-01-01") }, noUse, 3000).ok).toBe(false);
    expect(checkCoupon({ ...base, maxUses: 5 }, { ...noUse, totalUses: 5 }, 3000).ok).toBe(false);
  });
  it("respeita uso único por cliente e primeiro pedido", () => {
    expect(checkCoupon(base, { ...noUse, customerUses: 1 }, 3000).ok).toBe(false);
    expect(checkCoupon({ ...base, oncePerCustomer: false }, { ...noUse, customerUses: 1 }, 3000).ok).toBe(true);
    expect(checkCoupon({ ...base, firstOrderOnly: true }, { ...noUse, customerOrders: 2 }, 3000).ok).toBe(false);
  });
  it("respeita valor mínimo", () => {
    expect(checkCoupon({ ...base, minOrderCents: 4000 }, noUse, 3000).ok).toBe(false);
  });
  it("normaliza o código", () => {
    expect(normalizeCouponCode(" bem vindo10 ")).toBe("BEMVINDO10");
  });
});

describe("loyaltyStatus", () => {
  it("conta selos até completar o cartão", () => {
    expect(loyaltyStatus(10, 3, 0)).toEqual({ stamps: 3, ordersRequired: 10, rewardAvailable: false });
    expect(loyaltyStatus(10, 10, 0)).toEqual({ stamps: 10, ordersRequired: 10, rewardAvailable: true });
  });
  it("recompensa usada zera o cartão", () => {
    expect(loyaltyStatus(10, 10, 1)).toEqual({ stamps: 0, ordersRequired: 10, rewardAvailable: false });
    expect(loyaltyStatus(10, 14, 1)).toEqual({ stamps: 4, ordersRequired: 10, rewardAvailable: false });
  });
  it("selos acumulados além do cartão continuam valendo depois da recompensa", () => {
    expect(loyaltyStatus(5, 12, 1)).toEqual({ stamps: 5, ordersRequired: 5, rewardAvailable: true });
  });
});

describe("telefone", () => {
  it("normaliza formatos comuns", () => {
    for (const p of ["(11) 98888-7777", "+55 11 98888-7777", "011988887777", "5511988887777"]) expect(normalizePhone(p)).toBe("11988887777");
    expect(normalizePhone("(11) 3333-4444")).toBe("1133334444");
  });
  it("valida e formata", () => {
    expect(isValidPhone("11988887777")).toBe(true);
    expect(isValidPhone("988887777")).toBe(false);
    expect(formatPhone("11988887777")).toBe("(11) 98888-7777");
  });
});
