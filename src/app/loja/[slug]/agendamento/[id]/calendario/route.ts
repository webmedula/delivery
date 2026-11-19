import { db } from "@/lib/db";
import { icsEvent } from "@/lib/booking";
import { storeUrl } from "@/lib/store-url";

// Arquivo .ics do agendamento: no iPhone abre direto na Agenda (com lembrete 2 horas antes).
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const order = await db.order.findFirst({
    where: { id, fulfillment: "APPOINTMENT", store: { slug } },
    include: { items: { select: { name: true } }, store: { select: { name: true, address: true } } },
  });
  if (!order?.scheduledFor) return new Response("Não encontrado", { status: 404 });
  const services = order.items.map((i) => i.name).join(" + ");
  const body = icsEvent({
    uid: order.id,
    title: `${services} - ${order.store.name}`,
    start: order.scheduledFor,
    end: order.endsAt ?? new Date(order.scheduledFor.getTime() + 30 * 60_000),
    location: order.store.address,
    details: `${services}${order.professionalName ? ` com ${order.professionalName}` : ""}\n${await storeUrl(slug)}/agendamento/${order.id}`,
  });
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="horario-${order.number}.ics"` },
  });
}
