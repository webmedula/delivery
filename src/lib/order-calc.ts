// Cálculo de pedido sem dependência de banco, para poder testar.

export type CatalogProduct = { id: string; name: string; priceCents: number; available: boolean };
export type CartLine = { productId: string; quantity: number; notes?: string };

export type StoreRules = {
  deliveryFeeCents: number;
  minOrderCents: number;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
};

export type PricedLine = {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  notes?: string;
};

export type OrderQuote =
  | { ok: true; lines: PricedLine[]; subtotalCents: number; deliveryFeeCents: number; totalCents: number }
  | { ok: false; error: string };

const MAX_QTY = 99;

/**
 * Recalcula o pedido no servidor a partir do catálogo da loja.
 * Nunca confia em preço vindo do navegador.
 */
export function quoteOrder(
  cart: CartLine[],
  catalog: CatalogProduct[],
  rules: StoreRules,
  fulfillment: "DELIVERY" | "PICKUP",
): OrderQuote {
  if (cart.length === 0) return { ok: false, error: "O carrinho está vazio." };
  if (fulfillment === "DELIVERY" && !rules.acceptsDelivery)
    return { ok: false, error: "Esta loja não faz entregas." };
  if (fulfillment === "PICKUP" && !rules.acceptsPickup)
    return { ok: false, error: "Esta loja não aceita retirada." };

  const byId = new Map(catalog.map((p) => [p.id, p]));
  const lines: PricedLine[] = [];
  for (const line of cart) {
    const product = byId.get(line.productId);
    if (!product) return { ok: false, error: "Um item do carrinho não existe mais." };
    if (!product.available) return { ok: false, error: `${product.name} está indisponível no momento.` };
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QTY)
      return { ok: false, error: "Quantidade inválida." };
    lines.push({
      productId: product.id,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity: line.quantity,
      notes: line.notes?.slice(0, 200) || undefined,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  if (subtotalCents < rules.minOrderCents)
    return { ok: false, error: "O pedido não atingiu o valor mínimo da loja." };

  const deliveryFeeCents = fulfillment === "DELIVERY" ? rules.deliveryFeeCents : 0;
  return { ok: true, lines, subtotalCents, deliveryFeeCents, totalCents: subtotalCents + deliveryFeeCents };
}
