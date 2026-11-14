import "server-only";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { normalizePhone } from "./phone";
import { getLoyaltyStamps } from "./customers";

export type CustomerSort = "recentes" | "gasto" | "pedidos" | "nome";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  marketingOptIn: boolean;
  createdAt: Date;
  orders: number;
  totalCents: number;
  lastOrderAt: Date | null;
  stamps: number | null;
  rewardAvailable: boolean;
};

/** Clientes da loja com pedidos, total gasto (sem cancelados) e última compra. */
export async function listCustomers(store: Store, opts: { q?: string; sort?: CustomerSort; onlyOptIn?: boolean }) {
  const q = opts.q?.trim();
  const digits = q ? normalizePhone(q) : "";
  const customers = await db.customer.findMany({
    where: {
      storeId: store.id,
      ...(opts.onlyOptIn ? { marketingOptIn: true } : {}),
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }
        : {}),
    },
    select: { id: true, name: true, phone: true, marketingOptIn: true, createdAt: true },
  });
  const ids = customers.map((c) => c.id);
  const [stats, loyalty] = await Promise.all([
    ids.length
      ? db.order.groupBy({
          by: ["customerId"],
          where: { storeId: store.id, customerId: { in: ids }, status: { not: "CANCELED" } },
          _count: true,
          _sum: { totalCents: true },
          _max: { createdAt: true },
        })
      : [],
    getLoyaltyStamps(store, ids),
  ]);
  const byId = new Map(stats.map((s) => [s.customerId, s]));

  const rows: CustomerRow[] = customers.map((c) => {
    const s = byId.get(c.id);
    const l = loyalty.get(c.id);
    return {
      ...c,
      orders: s?._count ?? 0,
      totalCents: s?._sum.totalCents ?? 0,
      lastOrderAt: s?._max.createdAt ?? null,
      stamps: store.loyaltyEnabled ? (l?.stamps ?? 0) : null,
      rewardAvailable: !!l?.rewardAvailable,
    };
  });

  const sort = opts.sort ?? "recentes";
  const time = (d: Date | null) => d?.getTime() ?? 0;
  rows.sort((a, b) =>
    sort === "gasto" ? b.totalCents - a.totalCents
    : sort === "pedidos" ? b.orders - a.orders
    : sort === "nome" ? a.name.localeCompare(b.name, "pt-BR")
    : time(b.lastOrderAt) - time(a.lastOrderAt) || time(b.createdAt) - time(a.createdAt),
  );
  return rows;
}
