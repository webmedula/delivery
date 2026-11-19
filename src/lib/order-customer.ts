import "server-only";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { checkCoupon, normalizeCouponCode, type CouponCheck } from "./discounts";
import { getSessionCustomer } from "./customers";

// Usado pelo pedido (cardápio) e pelo agendamento (barbearia).

/** Valida um cupom para a loja e o cliente (customerId null = cliente novo). */
export async function evaluateCoupon(storeId: string, rawCode: string, customerId: string | null, subtotalCents: number) {
  const code = normalizeCouponCode(rawCode);
  const coupon = await db.coupon.findUnique({ where: { storeId_code: { storeId, code } } });
  if (!coupon) return { coupon: null, check: { ok: false, error: "Cupom inválido." } as CouponCheck };
  const notCanceled = { status: { not: "CANCELED" as const } };
  const [totalUses, customerUses, customerOrders] = await Promise.all([
    db.order.count({ where: { couponId: coupon.id, ...notCanceled } }),
    customerId ? db.order.count({ where: { couponId: coupon.id, customerId, ...notCanceled } }) : 0,
    customerId ? db.order.count({ where: { customerId, ...notCanceled } }) : 0,
  ]);
  return { coupon, check: checkCoupon(coupon, { totalUses, customerUses, customerOrders }, subtotalCents) };
}

/** Cliente do pedido. `trusted` = este aparelho está logado como esse cliente. */
export async function resolveCustomer(store: Store, phone: string) {
  const session = await getSessionCustomer(store.id);
  if (session && session.phone === phone) return { customer: session, trusted: true, isNew: false };
  const existing = await db.customer.findUnique({ where: { storeId_phone: { storeId: store.id, phone } } });
  if (existing) return { customer: existing, trusted: false, isNew: false };
  return { customer: null, trusted: true, isNew: true };
}

