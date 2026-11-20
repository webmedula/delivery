// Como um agendamento vira evento no Google Agenda (parte pura, sem rede, para testar).

import { formatPhone, whatsappLink } from "./phone";

export type CalendarOrder = {
  id: string;
  number: number;
  status: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  totalCents: number;
  depositCents: number | null;
  depositPaidAt: Date | null;
  scheduledFor: Date | null;
  endsAt: Date | null;
  professionalId: string | null;
  professionalName: string | null;
  customerConfirmedAt: Date | null;
  items: { name: string }[];
};

/** O agendamento deve aparecer nesta agenda? (a da barbearia recebe todos; a do profissional, só os dele) */
export function belongsTo(order: Pick<CalendarOrder, "professionalId">, connection: { professionalId: string | null }) {
  return connection.professionalId === null || connection.professionalId === order.professionalId;
}

/**
 * Fica no Google Agenda enquanto o horário está de pé. Cancelado e falta saem da agenda.
 * Esperando o pagamento online (30 min) ainda não entra: só depois de pago.
 */
export function shouldShow(order: Pick<CalendarOrder, "status" | "paymentStatus" | "scheduledFor">) {
  if (!order.scheduledFor || order.status === "CANCELED") return false;
  return !["AWAITING", "FAILED", "EXPIRED"].includes(order.paymentStatus);
}

/** Id do evento no Google: fixo por agendamento (letras a-v e números), para nunca duplicar. */
export function googleEventId(orderId: string) {
  return `ev${Buffer.from(orderId, "utf8").toString("hex")}`;
}

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function eventBody(
  order: CalendarOrder,
  opts: { storeName: string; storeAddress: string | null; panelUrl: string; showProfessional: boolean },
) {
  const start = order.scheduledFor!;
  const end = order.endsAt && order.endsAt > start ? order.endsAt : new Date(start.getTime() + 30 * 60_000);
  const services = order.items.map((i) => i.name).join(" + ") || "Atendimento";
  const done = order.status === "COMPLETED";
  const pro = opts.showProfessional && order.professionalName ? ` (com ${order.professionalName})` : "";
  const lines = [
    `${services}${order.professionalName ? ` com ${order.professionalName}` : ""}`,
    `Cliente: ${order.customerName}${order.customerPhone ? ` · ${formatPhone(order.customerPhone)}` : ""}`,
    ...(order.customerPhone ? [`WhatsApp: ${whatsappLink(order.customerPhone)}`] : []),
    ...(order.notes ? [`Recado: ${order.notes}`] : []),
    `Valor: ${brl(order.totalCents)}${order.depositCents ? ` (sinal ${brl(order.depositCents)}${order.depositPaidAt ? " pago" : ""})` : ""}`,
    ...(order.customerConfirmedAt ? ["O cliente confirmou presença ✓"] : []),
    ...(done ? ["Atendido ✓"] : []),
    "",
    `Agendamento #${order.number} no WebTenda: ${opts.panelUrl}`,
  ];
  return {
    id: googleEventId(order.id),
    status: "confirmed",
    summary: `${done ? "✓ " : ""}${order.customerName} · ${services}${pro}`,
    description: lines.join("\n"),
    ...(opts.storeAddress ? { location: opts.storeAddress } : {}),
    start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
    reminders: { useDefault: true },
    source: { title: `WebTenda · ${opts.storeName}`, url: opts.panelUrl },
    extendedProperties: { private: { webtendaOrderId: order.id } },
  };
}
