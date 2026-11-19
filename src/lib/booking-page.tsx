import "server-only";
import { db } from "@/lib/db";
import { canTakeOrders } from "@/lib/subscription";
import { BookingFlow } from "@/components/BookingFlow";
import { getLoyaltyStatus, getSessionCustomer } from "@/lib/customers";
import { describeDiscount } from "@/lib/discounts";
import { formatPhone } from "@/lib/phone";
import { onlineMethods } from "@/lib/payments";
import { CANCEL_OPTIONS, MIN_NOTICE_OPTIONS, describeWorkHours, formatAppointment } from "@/lib/booking";
import { activeProfessionals } from "@/lib/booking-data";
import type { getStore } from "@/lib/storefront-page";

type FullStore = NonNullable<Awaited<ReturnType<typeof getStore>>>;

/** Horário de funcionamento da loja: junta o expediente de todos os profissionais. */
function storeHours(pros: { workHours: string[] }[]) {
  const merged = Array.from({ length: 7 }, (_, d) => {
    const ranges = pros.map((p) => p.workHours[d]).filter(Boolean).sort();
    if (!ranges.length) return "";
    const start = ranges.map((r) => r.slice(0, 5)).sort()[0];
    const end = ranges.map((r) => r.slice(6)).sort().reverse()[0];
    return `${start}-${end}`;
  });
  return describeWorkHours(merged) || null;
}

/** Página pública da barbearia/salão: agenda online. */
export async function renderBooking(store: FullStore) {
  const pros = await activeProfessionals(store.id);
  const customer = await getSessionCustomer(store.id);
  const now = new Date();
  const [loyalty, upcoming] = customer
    ? await Promise.all([
        getLoyaltyStatus(store, customer.id),
        db.order.findMany({
          where: { storeId: store.id, customerId: customer.id, fulfillment: "APPOINTMENT", status: { notIn: ["CANCELED", "COMPLETED"] }, scheduledFor: { gte: now } },
          orderBy: { scheduledFor: "asc" },
          take: 3,
          include: { items: { select: { name: true } } },
        }),
      ])
    : [null, []];
  const reward = { type: store.loyaltyRewardType, value: store.loyaltyRewardValue };
  const sections = [
    ...store.categories.map((c) => ({ id: c.id, name: c.name, products: store.products.filter((p) => p.categoryId === c.id) })),
    { id: "outros", name: "Outros", products: store.products.filter((p) => !p.categoryId) },
  ].filter((s) => s.products.length > 0);
  const notice = MIN_NOTICE_OPTIONS.find((o) => o.minutes === store.bookingMinMinutes);
  const cancel = CANCEL_OPTIONS.find((o) => o.hours === store.bookingCancelHours);

  return (
    <BookingFlow
      store={{
        slug: store.slug,
        name: store.name,
        description: store.description,
        address: store.address,
        logoUrl: store.logoUrl,
        whatsapp: store.whatsapp,
        accepting: store.isOpen && canTakeOrders(store),
        demo: store.isDemo,
        pixKey: !!store.pixKey,
        loyalty: store.loyaltyEnabled ? `a cada ${store.loyaltyOrdersRequired} atendimentos, ganhe ${describeDiscount(reward)}` : null,
        reward: store.loyaltyEnabled ? reward : null,
        online: onlineMethods(store),
        depositPercent: store.depositPercent,
        minNotice: store.bookingMinMinutes > 0 ? (notice?.label.toLowerCase() ?? `${store.bookingMinMinutes} minutos`) : null,
        cancelText:
          store.bookingCancelHours < 0
            ? "Para desmarcar, fale com a barbearia."
            : `Você pode cancelar pelo link do agendamento ${store.bookingCancelHours === 0 ? "até a hora marcada" : (cancel?.label.toLowerCase() ?? `até ${store.bookingCancelHours} horas antes`)}.`,
        hours: storeHours(pros),
      }}
      sections={sections.map((s) => ({
        id: s.id,
        name: s.name,
        services: s.products.map((p) => ({ id: p.id, name: p.name, description: p.description, priceCents: p.priceCents, durationMinutes: p.durationMinutes, imageUrl: p.imageUrl })),
      }))}
      pros={pros.map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl, serviceIds: p.serviceIds, hours: describeWorkHours(p.workHours).split(" · ")[0] ?? "" }))}
      customer={
        customer && {
          name: customer.name,
          phone: formatPhone(customer.phone),
          marketingOptIn: customer.marketingOptIn,
          cpfCnpj: customer.cpfCnpj,
          loyalty,
          upcoming: upcoming.map((o) => ({ id: o.id, when: formatAppointment(o.scheduledFor!, now), services: o.items.map((i) => i.name).join(" + "), professional: o.professionalName })),
        }
      }
    />
  );
}
