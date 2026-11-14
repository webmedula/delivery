"use server";

// Ações do link do entregador. Não há login: o token secreto do link identifica o entregador,
// e ele só mexe nos pedidos de entrega atribuídos a ele, nos passos "saí" e "entreguei".

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { courierNextStep, stampsFor } from "@/lib/delivery";

export async function courierAdvance(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const courier = await db.courier.findUnique({ where: { token } });
  if (!courier || !courier.active) return;
  const order = await db.order.findFirst({
    where: { id: orderId, storeId: courier.storeId, courierId: courier.id, fulfillment: "DELIVERY" },
  });
  if (!order) return;
  const step = courierNextStep(order.status);
  // O formulário diz para qual etapa o entregador quis ir; se a loja já mudou, não faz nada.
  if (!step || step.status !== formData.get("status")) return;
  await db.order.update({ where: { id: order.id }, data: { status: step.status, ...stampsFor(step.status, order) } });
  revalidatePath(`/entregador/${token}`);
  revalidatePath("/painel");
}
