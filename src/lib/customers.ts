import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { loyaltyStatus, type LoyaltyStatus } from "./discounts";

// Sessão do cliente final. É separada da sessão do lojista e vale por loja:
// um cookie por loja, assinado, guardando o id do cliente daquela loja.

const MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curto (mínimo 32 caracteres).");
  return new TextEncoder().encode(s);
}

const cookieName = (storeId: string) => `cliente_${storeId}`;

export async function setCustomerSession(storeId: string, customerId: string) {
  const token = await new SignJWT({ sub: customerId, store: storeId, kind: "customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(cookieName(storeId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearCustomerSession(storeId: string) {
  (await cookies()).delete(cookieName(storeId));
}

/** Cliente logado neste aparelho para esta loja, ou null. */
export async function getSessionCustomer(storeId: string) {
  const token = (await cookies()).get(cookieName(storeId))?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "customer" || payload.store !== storeId || !payload.sub) return null;
    return db.customer.findFirst({ where: { id: payload.sub, storeId } });
  } catch {
    return null;
  }
}

type LoyaltyStore = Pick<Store, "loyaltyEnabled" | "loyaltyOrdersRequired" | "loyaltyMinOrderCents">;

/** Cartão de fidelidade do cliente: pedidos concluídos que atingem o mínimo valem selo. */
export async function getLoyaltyStatus(store: LoyaltyStore, customerId: string): Promise<LoyaltyStatus | null> {
  if (!store.loyaltyEnabled) return null;
  const [qualifying, rewardsUsed] = await Promise.all([
    db.order.count({ where: { customerId, status: "COMPLETED", subtotalCents: { gte: store.loyaltyMinOrderCents } } }),
    db.order.count({ where: { customerId, loyaltyReward: true, status: { not: "CANCELED" } } }),
  ]);
  return loyaltyStatus(store.loyaltyOrdersRequired, qualifying, rewardsUsed);
}

/** Mesma contagem para vários clientes de uma vez (lista do painel). */
export async function getLoyaltyStamps(store: LoyaltyStore & { id: string }, customerIds: string[]) {
  const result = new Map<string, LoyaltyStatus>();
  if (!store.loyaltyEnabled || customerIds.length === 0) return result;
  const [qualifying, rewards] = await Promise.all([
    db.order.groupBy({
      by: ["customerId"],
      where: { storeId: store.id, customerId: { in: customerIds }, status: "COMPLETED", subtotalCents: { gte: store.loyaltyMinOrderCents } },
      _count: true,
    }),
    db.order.groupBy({
      by: ["customerId"],
      where: { storeId: store.id, customerId: { in: customerIds }, loyaltyReward: true, status: { not: "CANCELED" } },
      _count: true,
    }),
  ]);
  const used = new Map(rewards.map((r) => [r.customerId, r._count]));
  for (const q of qualifying)
    if (q.customerId) result.set(q.customerId, loyaltyStatus(store.loyaltyOrdersRequired, q._count, used.get(q.customerId) ?? 0));
  return result;
}
