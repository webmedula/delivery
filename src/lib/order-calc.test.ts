import { describe, expect, it } from "vitest";
import { quoteOrder } from "./order-calc";

const catalog = [
  { id: "a", name: "X-Burger", priceCents: 2500, available: true },
  { id: "b", name: "Refri", priceCents: 600, available: true },
  { id: "c", name: "Pausado", priceCents: 1000, available: false },
];
const rules = { deliveryFeeCents: 500, minOrderCents: 2000, acceptsDelivery: true, acceptsPickup: true };

describe("quoteOrder", () => {
  it("usa o preço do catálogo e soma a taxa de entrega", () => {
    const q = quoteOrder([{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }], catalog, rules, "DELIVERY");
    expect(q).toMatchObject({ ok: true, subtotalCents: 5600, deliveryFeeCents: 500, totalCents: 6100 });
  });
  it("retirada não cobra entrega", () => {
    const q = quoteOrder([{ productId: "a", quantity: 1 }], catalog, rules, "PICKUP");
    expect(q).toMatchObject({ ok: true, totalCents: 2500 });
  });
  it("recusa abaixo do mínimo", () => {
    expect(quoteOrder([{ productId: "b", quantity: 1 }], catalog, rules, "PICKUP").ok).toBe(false);
  });
  it("recusa produto indisponível, de outra loja ou quantidade inválida", () => {
    expect(quoteOrder([{ productId: "c", quantity: 3 }], catalog, rules, "PICKUP").ok).toBe(false);
    expect(quoteOrder([{ productId: "zzz", quantity: 1 }], catalog, rules, "PICKUP").ok).toBe(false);
    expect(quoteOrder([{ productId: "a", quantity: 0 }], catalog, rules, "PICKUP").ok).toBe(false);
    expect(quoteOrder([{ productId: "a", quantity: 1.5 }], catalog, rules, "PICKUP").ok).toBe(false);
  });
  it("respeita os modos aceitos pela loja", () => {
    const q = quoteOrder([{ productId: "a", quantity: 1 }], catalog, { ...rules, acceptsDelivery: false }, "DELIVERY");
    expect(q.ok).toBe(false);
  });
});
