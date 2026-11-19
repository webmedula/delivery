import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { brDateOf } from "./preorder";
import { availability, canDo, totalDuration, type BookingRules, type Busy } from "./booking";

// Consultas da agenda (barbearia, salão). As regras ficam em lib/booking (sem banco).

/** Agendamento pago online que o cliente não pagou em 30 minutos deixa de segurar o horário. */
export const AWAITING_HOLD_MINUTES = 30;

type Client = Prisma.TransactionClient | typeof db;

/** Atendimentos e bloqueios que ocupam a agenda entre `from` e `to`. */
export async function busyPeriods(storeId: string, from: Date, to: Date, client: Client = db, now = new Date()): Promise<Busy[]> {
  const [orders, blocks] = await Promise.all([
    client.order.findMany({
      where: {
        storeId,
        fulfillment: "APPOINTMENT",
        status: { not: "CANCELED" },
        scheduledFor: { lt: to },
        endsAt: { gt: from },
        NOT: { paymentStatus: "AWAITING", createdAt: { lt: new Date(now.getTime() - AWAITING_HOLD_MINUTES * 60_000) } },
      },
      select: { professionalId: true, scheduledFor: true, endsAt: true },
    }),
    client.timeBlock.findMany({
      where: { storeId, startsAt: { lt: to }, endsAt: { gt: from } },
      select: { professionalId: true, startsAt: true, endsAt: true },
    }),
  ]);
  return [
    // Atendimento sem profissional (ele foi excluído) não bloqueia ninguém.
    ...orders.filter((o) => o.professionalId).map((o) => ({ professionalId: o.professionalId, start: o.scheduledFor!, end: o.endsAt! })),
    ...blocks.map((b) => ({ professionalId: b.professionalId, start: b.startsAt, end: b.endsAt })),
  ];
}

/** Profissionais ativos, na ordem da loja. */
export function activeProfessionals(storeId: string, client: Client = db) {
  return client.professional.findMany({ where: { storeId, active: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

/** Atendimentos de cada profissional no dia (para escolher quem atende no "qualquer um"). */
export async function loadByProfessional(storeId: string, date: string, client: Client = db) {
  const start = new Date(new Date(`${date}T00:00:00Z`).getTime() + 3 * 60 * 60_000);
  const rows = await client.order.groupBy({
    by: ["professionalId"],
    where: { storeId, fulfillment: "APPOINTMENT", status: { not: "CANCELED" }, scheduledFor: { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60_000) } },
    _count: true,
  });
  return Object.fromEntries(rows.filter((r) => r.professionalId).map((r) => [r.professionalId!, r._count]));
}

/** Dias e horários livres para os serviços escolhidos, com um profissional ou qualquer um. */
export async function bookingAvailability(
  store: BookingRules & { id: string },
  services: { id: string; durationMinutes: number | null }[],
  professionalId: string | null,
  now = new Date(),
) {
  const serviceIds = services.map((s) => s.id);
  const pros = (await activeProfessionals(store.id)).filter((p) => canDo(p, serviceIds) && (!professionalId || p.id === professionalId));
  const duration = totalDuration(services);
  const maxDays = Math.min(store.bookingMaxDays, 90);
  const busy = await busyPeriods(store.id, now, new Date(now.getTime() + (maxDays + 2) * 24 * 60 * 60_000));
  return { duration, days: availability(pros, duration, store, busy, now), today: brDateOf(now) };
}
