// Baixa e devolução de estoque dos pedidos.
//
// O estoque é descontado quando o pedido entra (dentro da mesma transação que o cria),
// para duas pessoas não comprarem a última peça ao mesmo tempo. Se o pedido for
// cancelado (pela loja, pelo cliente ou porque o pagamento online não foi feito),
// as peças voltam para o estoque, uma vez só (Order.stockReserved).

import type { Prisma, PrismaClient } from "@prisma/client";
import type { PricedLine } from "./order-calc";

type Tx = Prisma.TransactionClient | PrismaClient;

export class OutOfStockError extends Error {
  constructor(public itemName: string) {
    super(`${itemName} esgotou enquanto você fazia o pedido. Tire da sacola para continuar.`);
  }
}

/**
 * Desconta o estoque das linhas do pedido. Só mexe no que controla estoque (stock não nulo).
 * Devolve true se alguma linha controlava estoque. Lança OutOfStockError se faltou.
 */
export async function reserveStock(tx: Prisma.TransactionClient, storeId: string, lines: PricedLine[]): Promise<boolean> {
  let reserved = false;
  for (const line of lines) {
    const res = line.variantId
      ? await tx.productVariant.updateMany({
          where: { id: line.variantId, storeId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        })
      : await tx.product.updateMany({
          where: { id: line.productId, storeId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
    if (res.count > 0) {
      reserved = true;
      continue;
    }
    // Nada atualizado: ou não controla estoque (stock nulo), ou faltou.
    const tracked = line.variantId
      ? await tx.productVariant.count({ where: { id: line.variantId, stock: { not: null } } })
      : await tx.product.count({ where: { id: line.productId, stock: { not: null } } });
    if (tracked > 0) throw new OutOfStockError(line.name);
  }
  return reserved;
}

/** Devolve ao estoque as peças de um pedido cancelado (se ainda não devolveu). */
export async function releaseStock(db: Tx, orderId: string): Promise<void> {
  const run = async (tx: Prisma.TransactionClient) => {
    // Marca primeiro: se dois cancelamentos chegarem juntos, só um devolve.
    const claimed = await tx.order.updateMany({ where: { id: orderId, stockReserved: true }, data: { stockReserved: false } });
    if (claimed.count === 0) return;
    const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, variantId: true, quantity: true } });
    for (const i of items) {
      if (i.variantId) {
        await tx.productVariant.updateMany({ where: { id: i.variantId, stock: { not: null } }, data: { stock: { increment: i.quantity } } });
      } else if (i.productId) {
        await tx.product.updateMany({ where: { id: i.productId, stock: { not: null } }, data: { stock: { increment: i.quantity } } });
      }
    }
  };
  if ("$transaction" in db) await db.$transaction(run);
  else await run(db);
}
