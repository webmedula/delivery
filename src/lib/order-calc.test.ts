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

describe("quoteOrder com cor, tamanho e estoque", () => {
  const v = (id: string, color: string | null, size: string | null, stock: number | null, priceCents: number | null = null, active = true) =>
    ({ id, color, size, stock, priceCents, active });
  const shop = [
    { id: "vest", name: "Vestido Floral", priceCents: 15990, available: true, variants: [v("az-p", "Azul", "P", 2), v("az-m", "Azul", "M", 0), v("az-gg", "Azul", "GG", null, 16990), v("x", "Rosa", "P", 5, null, false)] },
    { id: "bolsa", name: "Bolsa", priceCents: 9990, available: true, stock: 1 },
    { id: "meia", name: "Meia", priceCents: 1500, available: true, stock: null },
  ];
  const free = { deliveryFeeCents: 0, minOrderCents: 0, acceptsDelivery: true, acceptsPickup: true };

  it("usa o nome com a variação e o preço da variação quando ela tem um", () => {
    const q = quoteOrder([{ productId: "vest", variantId: "az-gg", quantity: 1 }], shop, free, "PICKUP");
    expect(q).toMatchObject({ ok: true, subtotalCents: 16990, lines: [{ name: "Vestido Floral (Azul · GG)", variantId: "az-gg", variantLabel: "Azul · GG" }] });
    const q2 = quoteOrder([{ productId: "vest", variantId: "az-p", quantity: 2 }], shop, free, "PICKUP");
    expect(q2).toMatchObject({ ok: true, subtotalCents: 31980 });
  });
  it("exige escolher a variação e recusa variação pausada ou de outro produto", () => {
    expect(quoteOrder([{ productId: "vest", quantity: 1 }], shop, free, "PICKUP")).toMatchObject({ ok: false, error: "Escolha a cor e o tamanho de Vestido Floral." });
    expect(quoteOrder([{ productId: "vest", variantId: "x", quantity: 1 }], shop, free, "PICKUP").ok).toBe(false);
    expect(quoteOrder([{ productId: "bolsa", variantId: "az-p", quantity: 1 }], shop, free, "PICKUP").ok).toBe(false);
  });
  it("confere o estoque somando linhas repetidas", () => {
    expect(quoteOrder([{ productId: "vest", variantId: "az-m", quantity: 1 }], shop, free, "PICKUP")).toMatchObject({ ok: false, error: "Vestido Floral (Azul · M) esgotou. Tire da sacola para continuar." });
    expect(quoteOrder([{ productId: "vest", variantId: "az-p", quantity: 2 }, { productId: "vest", variantId: "az-p", quantity: 1 }], shop, free, "PICKUP"))
      .toMatchObject({ ok: false, error: "Só restam 2 unidades de Vestido Floral (Azul · P)." });
    expect(quoteOrder([{ productId: "bolsa", quantity: 2 }], shop, free, "PICKUP")).toMatchObject({ ok: false, error: "Só resta 1 unidade de Bolsa." });
    expect(quoteOrder([{ productId: "meia", quantity: 50 }], shop, free, "PICKUP").ok).toBe(true);
  });
});
