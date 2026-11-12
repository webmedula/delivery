"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { quoteOrder } from "@/lib/order-calc";
import { canTakeOrders } from "@/lib/subscription";
import { parseBRLToCents } from "@/lib/money";

const schema = z.object({
  slug: z.string(),
  cart: z.array(z.object({ productId: z.string(), quantity: z.number().int(), notes: z.string().optional() })).max(50),
  customerName: z.string().trim().min(2, "Informe seu nome."),
  customerPhone: z.string().trim().min(8, "Informe seu telefone."),
  fulfillment: z.enum(["DELIVERY", "PICKUP"]),
  address: z.string().trim().max(300).optional(),
  paymentMethod: z.enum(["PIX", "CASH", "CARD_ON_DELIVERY"]),
  changeFor: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

export type PlaceOrderResult = { ok: true; orderId: string } | { ok: false; error: string };

export async function placeOrder(input: z.input<typeof schema>): Promise<PlaceOrderResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const store = await db.store.findUnique({ where: { slug: data.slug }, include: { plan: true } });
  if (!store) return { ok: false, error: "Loja não encontrada." };
  if (!store.isOpen || !canTakeOrders(store)) return { ok: false, error: "A loja não está recebendo pedidos agora." };
  if (data.fulfillment === "DELIVERY" && !data.address) return { ok: false, error: "Informe o endereço de entrega." };

  if (store.plan.maxOrdersMonth > 0) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const count = await db.order.count({ where: { storeId: store.id, createdAt: { gte: monthStart } } });
    if (count >= store.plan.maxOrdersMonth) return { ok: false, error: "A loja não está recebendo pedidos agora." };
  }

  const catalog = await db.product.findMany({
    where: { storeId: store.id, id: { in: data.cart.map((c) => c.productId) } },
    select: { id: true, name: true, priceCents: true, available: true },
  });
  const quote = quoteOrder(data.cart, catalog, store, data.fulfillment);
  if (!quote.ok) return quote;

  const changeForCents =
    data.paymentMethod === "CASH" && data.changeFor ? parseBRLToCents(data.changeFor) : null;

  // Número sequencial por loja. Em caso de corrida, a constraint única
  // (storeId, number) falha e tentamos de novo.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await db.$transaction(async (tx) => {
        const last = await tx.order.findFirst({ where: { storeId: store.id }, orderBy: { number: "desc" }, select: { number: true } });
        return tx.order.create({
          data: {
            storeId: store.id,
            number: (last?.number ?? 0) + 1,
            fulfillment: data.fulfillment,
            paymentMethod: data.paymentMethod,
            changeForCents,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            address: data.fulfillment === "DELIVERY" ? data.address : null,
            notes: data.notes || null,
            subtotalCents: quote.subtotalCents,
            deliveryFeeCents: quote.deliveryFeeCents,
            totalCents: quote.totalCents,
            items: { create: quote.lines.map((l) => ({ productId: l.productId, name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity, notes: l.notes })) },
          },
        });
      });
      return { ok: true, orderId: order.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "Não foi possível registrar o pedido. Tente de novo." };
}
