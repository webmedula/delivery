// Mensagem do cliente para a loja no WhatsApp, com o resumo do pedido. Sem dependência de banco, para poder testar.

import type { FulfillmentType, PaymentMethod, PaymentStatus } from "@prisma/client";
import { formatBRL } from "./money";
import { paymentLabel } from "./order-status";

type SummaryOrder = {
  number: number;
  fulfillment: FulfillmentType;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  totalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  couponCode: string | null;
  loyaltyReward: boolean;
  address: string | null;
  deliveryZoneName: string | null;
  shippingMethodName?: string | null;
  tableLabel?: string | null;
  notes: string | null;
  customerName: string;
  items: { quantity: number; name: string; unitPriceCents: number }[];
};

export function orderSummaryMessage(order: SummaryOrder, opts: { trackingUrl?: string; catalogWord?: string } = {}) {
  const combine = order.paymentMethod === "WHATSAPP";
  const lines = [
    combine
      ? `Olá! Sou ${order.customerName.trim().split(/\s+/)[0] || "cliente"} e quero fechar o pedido #${order.number} que montei no ${opts.catalogWord ?? "cardápio"}:`
      : `Olá! Acabei de fazer o pedido #${order.number} pelo ${opts.catalogWord ?? "cardápio"}.`,
    "",
    ...order.items.map((i) => `${i.quantity}x ${i.name} · ${formatBRL(i.unitPriceCents * i.quantity)}`),
    ...(order.discountCents > 0
      ? [`Desconto: −${formatBRL(order.discountCents)}${order.couponCode ? ` (cupom ${order.couponCode})` : order.loyaltyReward ? " (fidelidade)" : ""}`]
      : []),
    ...(order.fulfillment === "DELIVERY" && order.deliveryFeeCents > 0 ? [`Entrega: ${formatBRL(order.deliveryFeeCents)}`] : []),
    ...(order.fulfillment === "SHIPPING"
      ? [`Frete${order.shippingMethodName ? ` (${order.shippingMethodName})` : ""}: ${order.deliveryFeeCents > 0 ? formatBRL(order.deliveryFeeCents) : "grátis"}`]
      : []),
    combine
      ? `Total: ${formatBRL(order.totalCents)}`
      : `Total: ${formatBRL(order.totalCents)} (${paymentLabel[order.paymentMethod]}${order.paymentStatus === "PAID" ? ", já pago" : ""})`,
    order.fulfillment === "DELIVERY"
      ? `Entregar em: ${order.address}${order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ""}`
      : order.fulfillment === "SHIPPING"
        ? `Enviar para: ${order.address}`
        : order.fulfillment === "TABLE"
          ? `Estou na ${order.tableLabel ?? "mesa"}.`
          : "Vou retirar na loja.",
    ...(order.notes ? [`Obs.: ${order.notes}`] : []),
    ...(combine ? ["", "Como faço o pagamento?"] : []),
    ...(opts.trackingUrl ? ["", `Pedido: ${opts.trackingUrl}`] : []),
  ];
  return lines.join("\n").replace(/ /g, " ");
}

/** Link wa.me para a loja (whatsapp só dígitos, com DDI). */
export function storeWhatsappLink(whatsapp: string, text: string) {
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
}
