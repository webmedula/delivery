// Regras de cupom e fidelidade sem dependência de banco, para poder testar.

import { formatBRL } from "./money";

export type Discount = { type: "PERCENT" | "FIXED"; value: number };

/** Desconto em centavos sobre o subtotal (nunca sobre a entrega), limitado ao subtotal. */
export function discountCents(subtotalCents: number, d: Discount): number {
  const raw = d.type === "PERCENT" ? Math.round((subtotalCents * d.value) / 100) : d.value;
  return Math.max(0, Math.min(subtotalCents, raw));
}

export function describeDiscount(d: Discount): string {
  return d.type === "PERCENT" ? `${d.value}% de desconto` : `${formatBRL(d.value)} de desconto`;
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export type CouponRules = Discount & {
  active: boolean;
  expiresAt: Date | null;
  minOrderCents: number;
  maxUses: number; // 0 = ilimitado
  oncePerCustomer: boolean;
  firstOrderOnly: boolean;
};

export type CouponUsage = {
  totalUses: number; // pedidos não cancelados com o cupom
  customerUses: number; // pedidos não cancelados deste cliente com o cupom
  customerOrders: number; // pedidos não cancelados deste cliente na loja
};

export type CouponCheck = { ok: true; discountCents: number } | { ok: false; error: string };

export function checkCoupon(c: CouponRules, usage: CouponUsage, subtotalCents: number, now = new Date()): CouponCheck {
  if (!c.active) return { ok: false, error: "Cupom inválido." };
  if (c.expiresAt && c.expiresAt.getTime() < now.getTime()) return { ok: false, error: "Este cupom expirou." };
  if (c.maxUses > 0 && usage.totalUses >= c.maxUses) return { ok: false, error: "Este cupom já foi todo usado." };
  if (c.oncePerCustomer && usage.customerUses > 0) return { ok: false, error: "Você já usou este cupom." };
  if (c.firstOrderOnly && usage.customerOrders > 0) return { ok: false, error: "Este cupom é só para o primeiro pedido." };
  if (subtotalCents < c.minOrderCents)
    return { ok: false, error: `Este cupom vale para pedidos a partir de ${formatBRL(c.minOrderCents)}.` };
  return { ok: true, discountCents: discountCents(subtotalCents, c) };
}

export type LoyaltyProgram = { enabled: boolean; ordersRequired: number } & Discount;

export type LoyaltyStatus = {
  stamps: number; // selos no cartão atual (0 até ordersRequired)
  ordersRequired: number;
  rewardAvailable: boolean;
};

/**
 * Cartão de fidelidade: cada pedido concluído que atinge o valor mínimo vale um selo.
 * Ao juntar `ordersRequired` selos, o próximo pedido pode usar a recompensa,
 * que "gasta" os selos daquele cartão.
 */
export function loyaltyStatus(ordersRequired: number, qualifyingOrders: number, rewardsUsed: number): LoyaltyStatus {
  const required = Math.max(1, ordersRequired);
  const remaining = Math.max(0, qualifyingOrders - rewardsUsed * required);
  if (remaining >= required) return { stamps: required, ordersRequired: required, rewardAvailable: true };
  return { stamps: remaining, ordersRequired: required, rewardAvailable: false };
}
