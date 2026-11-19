// Cálculo de pedido sem dependência de banco, para poder testar.

export type CatalogVariant = { id: string; color: string | null; size: string | null; stock: number | null; priceCents: number | null; active: boolean };
export type CatalogProduct = {
  id: string; name: string; priceCents: number; available: boolean;
  /** Estoque do produto sem variações (null/undefined = não controla). */
  stock?: number | null;
  variants?: CatalogVariant[];
};
export type CartLine = { productId: string; variantId?: string; quantity: number; notes?: string };

export type StoreRules = {
  deliveryFeeCents: number;
  minOrderCents: number;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  acceptsShipping?: boolean;
};

export type PricedLine = {
  productId: string;
  variantId?: string;
  variantLabel?: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  notes?: string;
};

export type OrderQuote =
  | { ok: true; lines: PricedLine[]; subtotalCents: number; deliveryFeeCents: number; totalCents: number }
  | { ok: false; error: string };

const MAX_QTY = 99;

/** "Azul · M", "M" ou "Azul". */
export function variantLabel(v: { color: string | null; size: string | null }) {
  return [v.color, v.size].filter(Boolean).join(" · ");
}

/** Variações à venda do produto (as pausadas não contam). */
export function activeVariants(p: Pick<CatalogProduct, "variants">) {
  return (p.variants ?? []).filter((v) => v.active);
}

/**
 * Recalcula o pedido no servidor a partir do catálogo da loja.
 * Nunca confia em preço vindo do navegador.
 */
export function quoteOrder(
  cart: CartLine[],
  catalog: CatalogProduct[],
  rules: StoreRules,
  fulfillment: "DELIVERY" | "PICKUP" | "SHIPPING" | "TABLE",
): OrderQuote {
  if (cart.length === 0) return { ok: false, error: "O carrinho está vazio." };
  if (fulfillment === "DELIVERY" && !rules.acceptsDelivery)
    return { ok: false, error: "Esta loja não faz entregas." };
  if (fulfillment === "PICKUP" && !rules.acceptsPickup)
    return { ok: false, error: "Esta loja não aceita retirada." };
  if (fulfillment === "SHIPPING" && !rules.acceptsShipping)
    return { ok: false, error: "Esta loja não faz envios." };

  const byId = new Map(catalog.map((p) => [p.id, p]));
  const lines: PricedLine[] = [];
  // Quantidade pedida por unidade de estoque (variação ou produto), para conferir o estoque somando linhas repetidas.
  const wanted = new Map<string, { qty: number; stock: number; name: string }>();
  for (const line of cart) {
    const product = byId.get(line.productId);
    if (!product) return { ok: false, error: "Um item do carrinho não existe mais." };
    if (!product.available) return { ok: false, error: `${product.name} está indisponível no momento.` };
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QTY)
      return { ok: false, error: "Quantidade inválida." };
    const variants = activeVariants(product);
    let name = product.name;
    let unitPriceCents = product.priceCents;
    let label: string | undefined;
    let stockKey: string | null = null;
    let stock: number | null | undefined = product.stock;
    if (variants.length > 0) {
      const variant = variants.find((v) => v.id === line.variantId);
      if (!variant) return { ok: false, error: `Escolha a cor e o tamanho de ${product.name}.` };
      label = variantLabel(variant) || undefined;
      if (label) name = `${product.name} (${label})`;
      unitPriceCents = variant.priceCents ?? product.priceCents;
      stockKey = `v:${variant.id}`;
      stock = variant.stock;
    } else if (line.variantId) {
      return { ok: false, error: `${product.name} mudou. Tire da sacola e adicione de novo.` };
    } else {
      stockKey = `p:${product.id}`;
    }
    if (stock !== null && stock !== undefined && stockKey) {
      const w = wanted.get(stockKey) ?? { qty: 0, stock, name };
      w.qty += line.quantity;
      wanted.set(stockKey, w);
    }
    lines.push({
      productId: product.id,
      variantId: variants.length > 0 ? line.variantId : undefined,
      variantLabel: label,
      name,
      unitPriceCents,
      quantity: line.quantity,
      notes: line.notes?.slice(0, 200) || undefined,
    });
  }
  for (const w of wanted.values()) {
    if (w.stock <= 0) return { ok: false, error: `${w.name} esgotou. Tire da sacola para continuar.` };
    if (w.qty > w.stock) return { ok: false, error: `Só ${w.stock === 1 ? "resta 1 unidade" : `restam ${w.stock} unidades`} de ${w.name}.` };
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  // Pedido mínimo é coisa de entrega: na mesa o cliente pede aos poucos.
  if (fulfillment !== "TABLE" && subtotalCents < rules.minOrderCents)
    return { ok: false, error: "O pedido não atingiu o valor mínimo da loja." };

  // Entrega: taxa da loja ou do bairro. Envio: frete da tabela (calculado antes, em lib/shipping).
  const deliveryFeeCents = fulfillment === "PICKUP" || fulfillment === "TABLE" ? 0 : rules.deliveryFeeCents;
  return { ok: true, lines, subtotalCents, deliveryFeeCents, totalCents: subtotalCents + deliveryFeeCents };
}
