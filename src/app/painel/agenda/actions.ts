"use server";

// Agenda da barbearia/salão: atendimentos, lembretes, bloqueios e regras.
// Como no resto do painel, o storeId vem sempre da sessão.

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isValidPhone, normalizePhone, whatsappLink } from "@/lib/phone";
import { DEPOSIT_OPTIONS, brDateTime, normalizeTime, parseClosedDates } from "@/lib/preorder";
import { CANCEL_OPTIONS, MIN_NOTICE_OPTIONS, STEP_OPTIONS, canDo, confirmationMessage, totalDuration, validateBooking } from "@/lib/booking";
import { activeProfessionals, busyPeriods, loadByProfessional } from "@/lib/booking-data";
import { storeUrl } from "@/lib/store-url";

function refresh() {
  revalidatePath("/painel/agenda");
  revalidatePath("/painel/historico");
}

/** Atendido, não veio, cancelar, confirmar ou desfazer. */
export async function setAppointmentStatus(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const order = await db.order.findFirst({ where: { id: String(formData.get("id") ?? ""), storeId, fulfillment: "APPOINTMENT" } });
  if (!order) return;
  const now = new Date();
  const action = String(formData.get("action") ?? "");
  const data: Prisma.OrderUpdateInput =
    action === "complete" ? { status: "COMPLETED", completedAt: now, noShowAt: null, canceledAt: null }
    : action === "noshow" ? { status: "CANCELED", noShowAt: now, canceledAt: now, completedAt: null }
    : action === "cancel" ? { status: "CANCELED", canceledAt: now, noShowAt: null, completedAt: null }
    : action === "confirm" ? { status: "CONFIRMED", acceptedAt: order.acceptedAt ?? now, customerConfirmedAt: order.customerConfirmedAt ?? now }
    : action === "reopen" ? { status: "CONFIRMED", completedAt: null, canceledAt: null, noShowAt: null }
    : {};
  if (Object.keys(data).length === 0) return;
  await db.order.update({ where: { id: order.id }, data });
  refresh();
}

/** A loja mandou o lembrete pelo WhatsApp (o botão abre a conversa e chama isto). */
export async function markReminderSent(id: string) {
  const { storeId } = await requireStoreUser();
  await db.order.updateMany({ where: { id, storeId, fulfillment: "APPOINTMENT" }, data: { reminderSentAt: new Date() } });
  revalidatePath("/painel/agenda");
}

export type AgendaFormState = { error?: string; ok?: boolean; whatsappUrl?: string; savedAt?: number } | undefined;

/** Agendamento feito pela loja (cliente ligou, mandou mensagem ou chegou no balcão). */
export async function createAppointment(_: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  const { storeId, store } = await requireStoreUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("customerName");
  if (name.length < 2) return { error: "Informe o nome do cliente." };
  const phone = normalizePhone(get("customerPhone"));
  if (phone && !isValidPhone(phone)) return { error: "Telefone inválido. Use DDD + número, ex.: (11) 98888-7777." };
  const serviceIds = [...new Set(formData.getAll("serviceIds").map(String))].slice(0, 6);
  if (serviceIds.length === 0) return { error: "Marque pelo menos um serviço." };
  const services = await db.product.findMany({ where: { storeId, id: { in: serviceIds } }, select: { id: true, name: true, priceCents: true, durationMinutes: true } });
  if (services.length !== serviceIds.length) return { error: "Serviço não encontrado." };
  const date = get("date");
  const time = normalizeTime(get("time"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return { error: "Informe o dia e o horário." };
  const pros = (await activeProfessionals(storeId)).filter((p) => canDo(p, serviceIds));
  const professionalId = get("professionalId") || null;
  if (professionalId && !pros.some((p) => p.id === professionalId)) return { error: "Este profissional não faz um dos serviços marcados." };
  if (pros.length === 0) return { error: "Nenhum profissional ativo faz esses serviços. Confira em Profissionais." };
  const squeeze = formData.get("squeeze") === "on"; // encaixe: ignora expediente e horários ocupados
  const duration = totalDuration(services);
  const subtotal = services.reduce((s, x) => s + x.priceCents, 0);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${storeId}))) AS lock`;
        let start: Date;
        let end: Date;
        let proId: string;
        if (squeeze) {
          proId = professionalId ?? pros[0].id;
          start = brDateTime(date, time);
          end = new Date(start.getTime() + duration * 60_000);
        } else {
          const dayStart = brDateTime(date, "00:00");
          const busy = await busyPeriods(storeId, dayStart, new Date(dayStart.getTime() + 24 * 60 * 60_000), tx);
          const load = await loadByProfessional(storeId, date, tx);
          // A loja pode marcar em cima da hora e em qualquer dia à frente.
          const rules = { ...store, bookingMinMinutes: -24 * 60, bookingMaxDays: 365 };
          const slot = validateBooking(pros, { date, time, professionalId }, duration, rules, busy, new Date(), load);
          if (!slot.ok)
            return { error: `${slot.error.replace("acabou de ser ocupado", "está ocupado ou fora do expediente")} Para marcar mesmo assim, marque "Encaixe".` } as const;
          start = slot.start;
          end = slot.end;
          proId = slot.professionalId;
        }
        const pro = pros.find((p) => p.id === proId)!;
        const customer = phone
          ? await tx.customer.upsert({
              where: { storeId_phone: { storeId, phone } },
              update: {},
              create: { storeId, phone, name },
            })
          : null;
        const last = await tx.order.findFirst({ where: { storeId }, orderBy: { number: "desc" }, select: { number: true } });
        const order = await tx.order.create({
          data: {
            storeId,
            number: (last?.number ?? 0) + 1,
            fulfillment: "APPOINTMENT",
            paymentMethod: "IN_PERSON",
            status: "CONFIRMED",
            acceptedAt: new Date(),
            customerId: customer?.id ?? null,
            customerName: name,
            customerPhone: phone,
            notes: get("notes").slice(0, 500) || null,
            subtotalCents: subtotal,
            deliveryFeeCents: 0,
            totalCents: subtotal,
            scheduledFor: start,
            endsAt: end,
            professionalId: pro.id,
            professionalName: pro.name,
            items: { create: services.map((s) => ({ productId: s.id, name: s.name, unitPriceCents: s.priceCents, quantity: 1 })) },
          },
          include: { items: true },
        });
        return { order } as const;
      });
      if ("error" in result) return { error: result.error };
      refresh();
      const { order } = result;
      const url = `${await storeUrl(store.slug)}/agendamento/${order.id}`;
      return {
        ok: true,
        savedAt: Date.now(),
        whatsappUrl: phone ? whatsappLink(phone, confirmationMessage({ ...order, scheduledFor: order.scheduledFor! }, store.name, url, store.address)) : undefined,
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { error: "Não foi possível agendar. Tente de novo." };
}

/** Bloqueia um período (folga, compromisso) de um profissional ou de todos. */
export async function addTimeBlock(_: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  const { storeId } = await requireStoreUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const date = get("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Informe o dia." };
  const wholeDay = formData.get("wholeDay") === "on";
  const from = wholeDay ? "00:00" : normalizeTime(get("from"));
  const to = wholeDay ? "23:59" : normalizeTime(get("to"));
  if (!from || !to) return { error: "Informe o horário de início e de fim (ex.: 14h e 16h), ou marque o dia inteiro." };
  const startsAt = brDateTime(date, from);
  const endsAt = brDateTime(date, to);
  if (endsAt <= startsAt) return { error: "O fim precisa ser depois do início." };
  const professionalId = get("professionalId") || null;
  if (professionalId && !(await db.professional.findFirst({ where: { id: professionalId, storeId } }))) return { error: "Profissional não encontrado." };
  await db.timeBlock.create({ data: { storeId, professionalId, startsAt, endsAt, reason: get("reason").slice(0, 80) || null } });
  revalidatePath("/painel/agenda");
  return { ok: true, savedAt: Date.now() };
}

export async function removeTimeBlock(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.timeBlock.deleteMany({ where: { id: String(formData.get("id") ?? ""), storeId } });
  revalidatePath("/painel/agenda");
}

/** Regras da agenda online: intervalo, antecedência, prazo, cancelamento, sinal e dias fechados. */
export async function saveBookingSettings(_: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  const { storeId } = await requireStoreUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const step = Number(get("bookingStepMinutes"));
  if (!STEP_OPTIONS.includes(step)) return { error: "Intervalo inválido." };
  const minMinutes = Number(get("bookingMinMinutes"));
  if (!MIN_NOTICE_OPTIONS.some((o) => o.minutes === minMinutes)) return { error: "Antecedência inválida." };
  const maxDays = Number(get("bookingMaxDays"));
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 90) return { error: "Abra a agenda de 1 a 90 dias à frente." };
  const cancelHours = Number(get("bookingCancelHours"));
  if (!CANCEL_OPTIONS.some((o) => o.hours === cancelHours)) return { error: "Prazo de cancelamento inválido." };
  const deposit = Number(get("depositPercent"));
  if (!DEPOSIT_OPTIONS.includes(deposit)) return { error: "Sinal inválido." };
  const closed = parseClosedDates(get("bookingClosedDates"));
  if ("error" in closed) return { error: closed.error };
  await db.store.update({
    where: { id: storeId },
    data: {
      bookingStepMinutes: step,
      bookingMinMinutes: minMinutes,
      bookingMaxDays: maxDays,
      bookingCancelHours: cancelHours,
      depositPercent: deposit,
      bookingClosedDates: closed.dates,
    },
  });
  revalidatePath("/painel/agenda");
  return { ok: true, savedAt: Date.now() };
}
