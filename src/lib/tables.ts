// Pedido na mesa por QR code: regras sem dependência de banco, para poder testar.

import type { OrderStatus, PaymentStatus } from "@prisma/client";

export const MAX_TABLES = 200;

/** Endereço que vai no QR code da mesa. */
export function tablePath(slug: string, code: string) {
  return `/loja/${slug}/mesa/${code}`;
}

/** Nome padrão de uma mesa numerada. */
export function tableLabel(prefix: string, n: number) {
  return `${prefix.trim() || "Mesa"} ${n}`;
}

/**
 * Mesas a criar de uma vez, ex.: "Mesa" de 1 a 12. Pula nomes que já existem.
 * Devolve a lista de nomes ou um erro para o formulário.
 */
export function tablesToCreate(
  prefixRaw: string,
  fromRaw: string,
  toRaw: string,
  existing: string[],
): { labels: string[] } | { error: string } {
  const prefix = prefixRaw.replace(/\s+/g, " ").trim().slice(0, 30) || "Mesa";
  const from = Number(fromRaw);
  const to = toRaw.trim() ? Number(toRaw) : from;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from > 999 || to > 999)
    return { error: "Use números inteiros de 0 a 999." };
  if (to < from) return { error: "O número final não pode ser menor que o inicial." };
  if (to - from + 1 > 100) return { error: "Crie no máximo 100 mesas de uma vez." };
  const taken = new Set(existing.map((l) => l.toLowerCase()));
  const labels: string[] = [];
  for (let n = from; n <= to; n++) {
    const label = tableLabel(prefix, n);
    if (!taken.has(label.toLowerCase())) labels.push(label);
  }
  if (labels.length === 0) return { error: "Essas mesas já existem." };
  if (existing.length + labels.length > MAX_TABLES) return { error: `Limite de ${MAX_TABLES} mesas por loja.` };
  return { labels };
}

/** Ordena "Mesa 2" antes de "Mesa 10". */
export function compareTableLabels(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

type BillOrder = {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalCents: number;
  createdAt: Date;
  items: { name: string; quantity: number; unitPriceCents: number }[];
};

/** O pedido entra na conta da mesa? Cancelado ou pagamento online não concluído fica fora. */
export function countsInBill(o: Pick<BillOrder, "status" | "paymentStatus">) {
  if (o.status === "CANCELED") return false;
  return o.paymentStatus === "NONE" || o.paymentStatus === "PAID";
}

/**
 * Conta aberta da mesa: soma dos pedidos ainda não fechados, quanto já foi pago online
 * e quanto falta pagar, com os itens agrupados (2× Chopp + 1× Chopp = 3× Chopp).
 */
export function billSummary(orders: BillOrder[]) {
  const valid = orders.filter(countsInBill);
  const totalCents = valid.reduce((s, o) => s + o.totalCents, 0);
  const paidCents = valid.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.totalCents, 0);
  const items = new Map<string, { name: string; quantity: number; totalCents: number }>();
  for (const o of valid)
    for (const i of o.items) {
      const key = `${i.name}|${i.unitPriceCents}`;
      const row = items.get(key) ?? { name: i.name, quantity: 0, totalCents: 0 };
      row.quantity += i.quantity;
      row.totalCents += i.quantity * i.unitPriceCents;
      items.set(key, row);
    }
  const openSince = valid.length ? new Date(Math.min(...valid.map((o) => o.createdAt.getTime()))) : null;
  const waiting = valid.filter((o) => o.status !== "COMPLETED").length;
  return { orders: valid.length, totalCents, paidCents, dueCents: totalCents - paidCents, items: [...items.values()], openSince, waiting };
}

/** Divide a conta em partes iguais, ex.: R$ 100,00 por 3 = 33,34 + 33,33 + 33,33. */
export function splitBill(totalCents: number, people: number) {
  const n = Math.max(1, Math.min(50, Math.floor(people)));
  const base = Math.floor(totalCents / n);
  return Array.from({ length: n }, (_, i) => base + (i < totalCents - base * n ? 1 : 0));
}

export type CallKind = "WAITER" | "BILL";

export function isCallKind(v: unknown): v is CallKind {
  return v === "WAITER" || v === "BILL";
}

export const callText: Record<CallKind, string> = {
  WAITER: "chamou o garçom",
  BILL: "pediu a conta",
};

/** O chamado da mesa vale por 30 minutos; depois disso é considerado esquecido. */
export const CALL_TTL_MINUTES = 30;

export function activeCall(t: { callKind: string | null; calledAt: Date | null }, now = new Date()): CallKind | null {
  if (!isCallKind(t.callKind) || !t.calledAt) return null;
  return now.getTime() - t.calledAt.getTime() <= CALL_TTL_MINUTES * 60_000 ? t.callKind : null;
}

/** Opção extra no cadastro (?tipo=mesa): restaurante que atende no salão, já nasce com mesas. */
export const TABLE_SIGNUP = {
  value: "TABLE",
  param: "mesa",
  title: "Bar, restaurante ou lanchonete com mesas",
  examples: "Pedido na mesa pelo QR code, sem garçom anotar",
};

/** Como a loja nasce quando escolhe "com mesas": só retirada no balcão (sem entrega), mesas 1 a 10 e categorias de bar. */
export function tableSignupDefaults() {
  return {
    store: { acceptsDelivery: false, acceptsPickup: true },
    categories: ["Petiscos", "Pratos", "Bebidas", "Sobremesas"],
    tables: Array.from({ length: 10 }, (_, i) => tableLabel("Mesa", i + 1)),
  };
}
