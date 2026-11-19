"use server";

// Agendamento online (barbearia, salão): horários livres, marcar, confirmar presença e cancelar.

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { canTakeOrders } from "@/lib/subscription";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { discountCents } from "@/lib/discounts";
import { createOrderPayment, onlineMethods, cancelAwaitingOrder } from "@/lib/payments";
import { normalizeCpfCnpj } from "@/lib/cpf-cnpj";
import { MIN_ONLINE_PAYMENT_CENTS } from "@/lib/payment-events";
import { depositFor } from "@/lib/preorder";
import { canCustomerCancel, canDo, totalDuration, validateBooking, type BookingDay } from "@/lib/booking";
import { activeProfessionals, bookingAvailability, busyPeriods, loadByProfessional } from "@/lib/booking-data";
import { getLoyaltyStatus, setCustomerSession } from "@/lib/customers";
import { evaluateCoupon, resolveCustomer } from "@/lib/order-customer";

const ids = z.array(z.string().max(40)).min(1, "Escolha pelo menos um serviço.").max(6, "Escolha no máximo 6 serviços.");

async function bookingStore(slug: string) {
  const store = await db.store.findUnique({ where: { slug }, include: { plan: true } });
  return store?.businessType === "BOOKING" ? store : null;
}

async function servicesOf(storeId: string, serviceIds: string[]) {
  const unique = [...new Set(serviceIds)];
  const services = await db.product.findMany({
    where: { storeId, id: { in: unique }, available: true },
    select: { id: true, name: true, priceCents: true, durationMinutes: true },
  });
  // Na ordem em que o cliente escolheu.
  return services.length === unique.length ? unique.map((id) => services.find((s) => s.id === id)!) : null;
}

export type AvailabilityResult = { ok: true; duration: number; days: BookingDay[] } | { ok: false; error: string };

/** Dias e horários livres para os serviços escolhidos (com um profissional ou qualquer um). */
export async function getAvailability(slug: string, serviceIds: string[], professionalId: string | null): Promise<AvailabilityResult> {
  const parsed = ids.safeParse(serviceIds);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const store = await bookingStore(slug);
  if (!store) return { ok: false, error: "Loja não encontrada." };
  const services = await servicesOf(store.id, parsed.data);
  if (!services) return { ok: false, error: "Um dos serviços não está mais disponível. Atualize a página." };
  const result = await bookingAvailability(store, services, professionalId);
  return { ok: true, duration: result.duration, days: result.days };
}

const schema = z.object({
  slug: z.string(),
  serviceIds: ids,
  professionalId: z.string().max(40).nullable(),
  date: z.string().max(10),
  time: z.string().max(5),
  customerName: z.string().trim().min(2, "Informe seu nome.").max(100),
  customerPhone: z.string().trim().max(30),
  notes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["IN_PERSON", "PIX", "ONLINE_PIX", "ONLINE_CARD"]),
  cpfCnpj: z.string().max(20).optional(),
  couponCode: z.string().max(40).optional(),
  useReward: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
});

export type PlaceBookingResult = { ok: true; id: string } | { ok: false; error: string; /** o horário foi ocupado: recarregar a agenda */ refresh?: boolean };

export async function placeBooking(input: z.input<typeof schema>): Promise<PlaceBookingResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  const phone = normalizePhone(data.customerPhone);
  if (phone.length < 8) return { ok: false, error: "Informe seu WhatsApp." };
  if (!isValidPhone(phone)) return { ok: false, error: "Telefone inválido. Use DDD + número, ex.: (11) 98888-7777." };

  const store = await bookingStore(data.slug);
  if (!store) return { ok: false, error: "Loja não encontrada." };
  if (!store.isOpen || !canTakeOrders(store)) return { ok: false, error: "A agenda não está recebendo agendamentos agora." };
  if (store.plan.maxOrdersMonth > 0) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const count = await db.order.count({ where: { storeId: store.id, createdAt: { gte: monthStart }, paymentStatus: { not: "FAILED" } } });
    if (count >= store.plan.maxOrdersMonth) return { ok: false, error: "A agenda não está recebendo agendamentos agora." };
  }

  const services = await servicesOf(store.id, data.serviceIds);
  if (!services) return { ok: false, error: "Um dos serviços não está mais disponível. Atualize a página." };
  const duration = totalDuration(services);
  const pros = (await activeProfessionals(store.id)).filter((p) => canDo(p, data.serviceIds));
  if (data.professionalId && !pros.some((p) => p.id === data.professionalId))
    return { ok: false, error: "Este profissional não faz um dos serviços escolhidos. Escolha outro." };

  // Forma de pagamento: com sinal, precisa pagar algo antes (Pix ou cartão online, ou Pix pela chave).
  if (store.depositPercent > 0 && data.paymentMethod === "IN_PERSON")
    return { ok: false, error: "Esta barbearia cobra um sinal para garantir o horário. Escolha Pix ou cartão." };
  if (data.paymentMethod === "PIX" && !store.pixKey) return { ok: false, error: "Esta forma de pagamento não está disponível. Escolha outra." };
  const online = data.paymentMethod === "ONLINE_PIX" || data.paymentMethod === "ONLINE_CARD";
  if (online) {
    const methods = onlineMethods(store);
    if (data.paymentMethod === "ONLINE_PIX" ? !methods.pix : !methods.card)
      return { ok: false, error: "Esta forma de pagamento não está disponível. Escolha outra." };
    if (!normalizeCpfCnpj(data.cpfCnpj ?? "")) return { ok: false, error: "Informe um CPF válido para pagar online." };
  }

  const subtotal = services.reduce((s, x) => s + x.priceCents, 0);
  const { customer: known, trusted, isNew } = await resolveCustomer(store, phone);

  // Um desconto por agendamento: a recompensa de fidelidade (cliente logado) ou um cupom.
  let discount = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  let loyaltyReward = false;
  if (data.useReward) {
    const status = trusted && known ? await getLoyaltyStatus(store, known.id) : null;
    if (!status?.rewardAvailable) return { ok: false, error: "A recompensa de fidelidade não está disponível." };
    discount = discountCents(subtotal, { type: store.loyaltyRewardType, value: store.loyaltyRewardValue });
    loyaltyReward = true;
  } else if (data.couponCode?.trim()) {
    const { coupon, check } = await evaluateCoupon(store.id, data.couponCode, known?.id ?? null, subtotal);
    if (!check.ok || !coupon) return { ok: false, error: check.ok ? "Cupom inválido." : check.error };
    discount = check.discountCents;
    couponId = coupon.id;
    couponCode = coupon.code;
  }
  const total = subtotal - discount;
  const depositCents = depositFor(total, store.depositPercent);
  if (online && (depositCents ?? total) < MIN_ONLINE_PAYMENT_CENTS)
    return { ok: false, error: "Pagamento online só a partir de R$ 5,00. Escolha outra forma de pagamento." };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.$transaction(async (tx) => {
        // Um agendamento por vez nesta loja: dois clientes não pegam o mesmo horário.
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${store.id}))) AS lock`;
        const now = new Date();
        const dayStart = new Date(new Date(`${data.date}T00:00:00Z`).getTime() + 3 * 60 * 60_000);
        const busy = await busyPeriods(store.id, dayStart, new Date(dayStart.getTime() + 24 * 60 * 60_000), tx, now);
        const load = await loadByProfessional(store.id, data.date, tx);
        const slot = validateBooking(pros, data, duration, store, busy, now, load);
        if (!slot.ok) return slot;
        const pro = pros.find((p) => p.id === slot.professionalId)!;

        let customerId = known?.id;
        if (isNew) {
          const created = await tx.customer.upsert({
            where: { storeId_phone: { storeId: store.id, phone } },
            update: {},
            create: { storeId: store.id, phone, name: data.customerName, marketingOptIn: !!data.marketingOptIn },
          });
          customerId = created.id;
        } else if (trusted && known) {
          await tx.customer.update({
            where: { id: known.id },
            data: { name: data.customerName, ...(data.marketingOptIn ? { marketingOptIn: true } : {}) },
          });
        }
        const last = await tx.order.findFirst({ where: { storeId: store.id }, orderBy: { number: "desc" }, select: { number: true } });
        const order = await tx.order.create({
          data: {
            storeId: store.id,
            number: (last?.number ?? 0) + 1,
            fulfillment: "APPOINTMENT",
            paymentMethod: data.paymentMethod,
            paymentStatus: online ? "AWAITING" : "NONE",
            // O horário já fica garantido; a loja não precisa aceitar.
            status: "CONFIRMED",
            acceptedAt: now,
            customerId,
            customerName: data.customerName,
            customerPhone: phone,
            notes: data.notes || null,
            subtotalCents: subtotal,
            deliveryFeeCents: 0,
            discountCents: discount,
            couponId,
            couponCode,
            loyaltyReward,
            totalCents: total,
            scheduledFor: slot.start,
            endsAt: slot.end,
            depositCents,
            professionalId: pro.id,
            professionalName: pro.name,
            items: { create: services.map((s) => ({ productId: s.id, name: s.name, unitPriceCents: s.priceCents, quantity: 1 })) },
          },
        });
        return { ok: true as const, order };
      });
      if (!result.ok) return { ...result, refresh: true };
      const { order } = result;
      if (isNew && order.customerId) await setCustomerSession(store.id, order.customerId);
      if (online) {
        const payment = await createOrderPayment(order.id, data.cpfCnpj ?? "");
        if (!payment.ok) return payment;
      }
      revalidatePath("/painel/agenda");
      return { ok: true, id: order.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "Não foi possível agendar. Tente de novo." };
}

async function customerAppointment(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  return db.order.findFirst({
    where: { id: String(formData.get("id") ?? ""), fulfillment: "APPOINTMENT", store: { slug } },
    include: { store: true },
  });
}

/** O cliente confirma presença pelo link do lembrete. */
export async function confirmPresence(formData: FormData) {
  const order = await customerAppointment(formData);
  if (!order || order.status === "CANCELED" || order.status === "COMPLETED") return;
  await db.order.update({ where: { id: order.id }, data: { customerConfirmedAt: order.customerConfirmedAt ?? new Date(), ...(order.status === "PENDING" ? { status: "CONFIRMED", acceptedAt: new Date() } : {}) } });
  revalidatePath(`/loja/${order.store.slug}/agendamento/${order.id}`);
  revalidatePath("/painel/agenda");
}

/** O cliente cancela pelo link (dentro do prazo da loja). O horário volta a ficar livre. */
export async function cancelByCustomer(formData: FormData) {
  const order = await customerAppointment(formData);
  if (!order) return;
  if (order.paymentStatus === "AWAITING") await cancelAwaitingOrder(order);
  else if (canCustomerCancel(order, order.store.bookingCancelHours))
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELED", canceledAt: new Date() } });
  revalidatePath(`/loja/${order.store.slug}/agendamento/${order.id}`);
  revalidatePath("/painel/agenda");
}
