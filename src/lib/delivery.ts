// Regras do acompanhamento de entregas, sem dependência de banco, para poder testar.

import type { FulfillmentType, OrderStatus } from "@prisma/client";
import { formatBRL } from "./money";

/** Colunas do quadro de pedidos do painel. */
export const BOARD_COLUMNS = [
  { key: "new", title: "Novos", statuses: ["PENDING"] },
  { key: "preparing", title: "Em preparo", statuses: ["CONFIRMED", "PREPARING"] },
  { key: "out", title: "Saiu / pronto para retirar", statuses: ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP"] },
] as const satisfies readonly { key: string; title: string; statuses: readonly OrderStatus[] }[];

export const OPEN_STATUSES: OrderStatus[] = BOARD_COLUMNS.flatMap((c) => [...c.statuses]);

/** O próximo passo do pedido, com o texto do botão grande do cartão. */
export function nextStep(status: OrderStatus, fulfillment: FulfillmentType): { status: OrderStatus; label: string } | null {
  switch (status) {
    case "PENDING":
      return { status: "PREPARING", label: "Aceitar e preparar" };
    case "CONFIRMED":
      return { status: "PREPARING", label: "Começar preparo" };
    case "PREPARING":
      return fulfillment === "DELIVERY"
        ? { status: "OUT_FOR_DELIVERY", label: "Saiu para entrega" }
        : { status: "READY_FOR_PICKUP", label: "Pronto para retirar" };
    case "OUT_FOR_DELIVERY":
      return { status: "COMPLETED", label: "Entregue" };
    case "READY_FOR_PICKUP":
      return { status: "COMPLETED", label: "Cliente retirou" };
    default:
      return null;
  }
}

type Stamps = { acceptedAt?: Date | null; dispatchedAt?: Date | null; completedAt?: Date | null; canceledAt?: Date | null };

/** Datas a gravar quando o pedido muda para `status`. Não sobrescreve uma data que já existe. */
export function stampsFor(status: OrderStatus, current: Stamps, now = new Date()): Stamps {
  const patch: Stamps = {};
  const accepted = status === "CONFIRMED" || status === "PREPARING";
  const dispatched = status === "OUT_FOR_DELIVERY" || status === "READY_FOR_PICKUP";
  if ((accepted || dispatched || status === "COMPLETED") && !current.acceptedAt) patch.acceptedAt = now;
  if ((dispatched || status === "COMPLETED") && !current.dispatchedAt) patch.dispatchedAt = now;
  if (status === "COMPLETED" && !current.completedAt) patch.completedAt = now;
  if (status === "CANCELED" && !current.canceledAt) patch.canceledAt = now;
  // Voltou uma etapa (correção da loja): apaga o que ficou para trás.
  if (status !== "COMPLETED" && current.completedAt) patch.completedAt = null;
  if (status !== "CANCELED" && current.canceledAt) patch.canceledAt = null;
  if ((status === "PENDING" || accepted) && current.dispatchedAt) patch.dispatchedAt = null;
  if (status === "PENDING" && current.acceptedAt) patch.acceptedAt = null;
  return patch;
}

/** Etapas mostradas ao cliente na página do pedido. */
export function trackingSteps(fulfillment: FulfillmentType) {
  return [
    { label: "Recebido", statuses: ["PENDING"] },
    { label: "Em preparo", statuses: ["CONFIRMED", "PREPARING"] },
    fulfillment === "DELIVERY"
      ? { label: "Saiu para entrega", statuses: ["OUT_FOR_DELIVERY"] }
      : { label: "Pronto para retirar", statuses: ["READY_FOR_PICKUP"] },
    { label: fulfillment === "DELIVERY" ? "Entregue" : "Retirado", statuses: ["COMPLETED"] },
  ] as { label: string; statuses: OrderStatus[] }[];
}

/** Índice da etapa atual em trackingSteps (-1 se cancelado). */
export function currentStepIndex(status: OrderStatus, fulfillment: FulfillmentType) {
  return trackingSteps(fulfillment).findIndex((s) => s.statuses.includes(status));
}

export type EtaRules = {
  deliveryMinutesMin: number | null;
  deliveryMinutesMax: number | null;
  pickupMinutesMin: number | null;
  pickupMinutesMax: number | null;
};

/** Faixa de tempo da loja para o tipo de pedido, ou null se a loja não informou. */
export function etaFor(rules: EtaRules, fulfillment: FulfillmentType): { min: number; max: number } | null {
  const [min, max] =
    fulfillment === "DELIVERY" ? [rules.deliveryMinutesMin, rules.deliveryMinutesMax] : [rules.pickupMinutesMin, rules.pickupMinutesMax];
  if (!min) return null;
  return { min, max: max && max > min ? max : min };
}

/** "40 a 60 min" ou "30 min". */
export function formatMinutes(range: { min: number; max: number }) {
  return range.max > range.min ? `${range.min} a ${range.max} min` : `${range.min} min`;
}

const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Hora no fuso de Brasília, ex.: "19:40". */
export function formatClock(date: Date) {
  return clock.format(date);
}

/** Previsão de chegada a partir da hora do pedido, ex.: "19:40 e 20:00" (ou só "19:40"). */
export function formatEta(createdAt: Date, min: number, max: number | null) {
  const from = formatClock(new Date(createdAt.getTime() + min * 60_000));
  if (!max || max <= min) return from;
  return `${from} e ${formatClock(new Date(createdAt.getTime() + max * 60_000))}`;
}

/** Valida os campos de tempo do formulário da loja. Vazio = não mostrar. */
export function parseMinutesRange(minRaw: string, maxRaw: string): { min: number | null; max: number | null } | { error: string } {
  const min = minRaw.trim() ? Number(minRaw) : null;
  const max = maxRaw.trim() ? Number(maxRaw) : null;
  const ok = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= 600);
  if (!ok(min) || !ok(max)) return { error: "O tempo deve ser em minutos inteiros, de 1 a 600." };
  if (min === null) return { min: null, max: null };
  if (max !== null && max < min) return { error: "O tempo máximo não pode ser menor que o mínimo." };
  return { min, max };
}

export type Zone = { id: string; name: string; feeCents: number; active: boolean };

/**
 * Taxa de entrega do pedido. Sem bairros cadastrados vale a taxa única da loja;
 * com bairros, o cliente precisa escolher um bairro ativo.
 */
export function resolveDeliveryFee(
  zones: Zone[],
  zoneId: string | null | undefined,
  defaultFeeCents: number,
): { ok: true; feeCents: number; zone: Zone | null } | { ok: false; error: string } {
  const active = zones.filter((z) => z.active);
  if (active.length === 0) return { ok: true, feeCents: defaultFeeCents, zone: null };
  const zone = active.find((z) => z.id === zoneId);
  if (!zone) return { ok: false, error: "Escolha o seu bairro para calcular a entrega." };
  return { ok: true, feeCents: zone.feeCents, zone };
}

/** Bairro que aparece no endereço salvo, para já vir marcado na sacola. */
export function guessZone(zones: Zone[], address: string | undefined) {
  if (!address) return undefined;
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const a = norm(address);
  return [...zones].sort((x, y) => y.name.length - x.name.length).find((z) => z.active && a.includes(norm(z.name)));
}

type MessageOrder = {
  number: number;
  status: OrderStatus;
  fulfillment: FulfillmentType;
  customerName: string;
  totalCents: number;
  paymentStatus: string;
  paymentMethod: string;
  changeForCents: number | null;
  createdAt: Date;
  etaMinutesMin: number | null;
  etaMinutesMax: number | null;
};

/** Mensagem pronta de WhatsApp para a loja avisar o cliente sobre a etapa atual do pedido. */
export function customerMessage(order: MessageOrder, storeName: string, trackingUrl: string, storeAddress?: string | null) {
  const first = order.customerName.trim().split(/\s+/)[0] || "";
  const hi = `Olá${first ? `, ${first}` : ""}!`;
  const ref = `seu pedido #${order.number} da ${storeName}`;
  const toPay =
    order.paymentStatus === "PAID"
      ? ""
      : order.paymentMethod === "CASH"
        ? ` Valor: ${formatBRL(order.totalCents)}${order.changeForCents ? ` (troco para ${formatBRL(order.changeForCents)})` : ""}.`
        : ` Valor: ${formatBRL(order.totalCents)}.`;
  const eta = order.etaMinutesMin ? ` Previsão: entre ${formatEta(order.createdAt, order.etaMinutesMin, order.etaMinutesMax)}.` : "";
  let body: string;
  switch (order.status) {
    case "PENDING":
      body = `${hi} Recebemos ${ref}.${eta}`;
      break;
    case "CONFIRMED":
    case "PREPARING":
      body = `${hi} ${cap(ref)} foi aceito e já está em preparo.${eta}`;
      break;
    case "OUT_FOR_DELIVERY":
      body = `${hi} ${cap(ref)} saiu para entrega e logo chega aí.${toPay}`;
      break;
    case "READY_FOR_PICKUP":
      body = `${hi} ${cap(ref)} está pronto para retirar${storeAddress ? ` em ${storeAddress}` : ""}.${toPay}`;
      break;
    case "COMPLETED":
      body = `${hi} ${cap(ref)} foi ${order.fulfillment === "DELIVERY" ? "entregue" : "retirado"}. Obrigado pela preferência!`;
      break;
    case "CANCELED":
      body = `${hi} Infelizmente ${ref} foi cancelado. Se quiser, fale com a gente por aqui.`;
      break;
  }
  const text = order.status === "COMPLETED" || order.status === "CANCELED" ? body : `${body}\nAcompanhe aqui: ${trackingUrl}`;
  return text.replace(/\u00a0/g, " "); // "R$ 10,00" com espaço comum, para o WhatsApp
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Minutos desde a data, para o cartão mostrar "há 12 min". */
export function minutesSince(date: Date, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
}

const BRT_OFFSET = 3 * 60 * 60_000; // Brasília = UTC-3 (sem horário de verão)

/** Data "2026-11-14" no fuso de Brasília. */
export function brDate(d: Date) {
  return new Date(d.getTime() - BRT_OFFSET).toISOString().slice(0, 10);
}

/** Meia-noite (horário de Brasília) do dia "2026-11-14", ou de hoje. */
export function brDayStart(day: string = brDate(new Date())) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + BRT_OFFSET);
}
