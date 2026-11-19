// Encomendas (bolos, doces, salgados para festa, marmitas da semana): o cliente escolhe
// o dia e o horário de retirada/entrega, respeitando a antecedência mínima da loja,
// e a loja pode cobrar um sinal. Funções puras (sem banco), para poder testar.
//
// Datas no fuso de Brasília (UTC-3, sem horário de verão), como em lib/delivery.

import { formatBRL } from "./money";

const BRT_OFFSET = 3 * 60 * 60_000;
const DAY = 24 * 60 * 60_000;

export type PreorderRules = {
  preorderMinHours: number;
  preorderMaxDays: number;
  preorderWeekdays: number[];
  preorderTimes: string[];
  preorderDailyLimit: number | null;
  preorderClosedDates: string[];
};

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Opções de antecedência mínima no painel, em horas. */
export const MIN_HOURS_OPTIONS = [
  { hours: 2, label: "2 horas" },
  { hours: 6, label: "6 horas" },
  { hours: 12, label: "12 horas" },
  { hours: 24, label: "1 dia (24 horas)" },
  { hours: 48, label: "2 dias (48 horas)" },
  { hours: 72, label: "3 dias" },
  { hours: 120, label: "5 dias" },
  { hours: 168, label: "1 semana" },
];

export const DEPOSIT_OPTIONS = [0, 30, 50, 100];

/** "2026-11-21" -> instante da hora "14:00" desse dia em Brasília. */
export function brDateTime(date: string, time: string) {
  return new Date(new Date(`${date}T${time}:00Z`).getTime() + BRT_OFFSET);
}

/** Data "2026-11-21" (Brasília) de um instante. */
export function brDateOf(d: Date) {
  return new Date(d.getTime() - BRT_OFFSET).toISOString().slice(0, 10);
}

/** Hora "14:00" (Brasília) de um instante. */
export function brTimeOf(d: Date) {
  return new Date(d.getTime() - BRT_OFFSET).toISOString().slice(11, 16);
}

function addDays(date: string, days: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** "sáb, 21/11" */
export function shortDayLabel(date: string) {
  const [, m, d] = date.split("-");
  return `${WEEKDAYS_SHORT[weekdayOf(date)]}, ${d}/${m}`;
}

/** "sábado, 21/11" (com "hoje"/"amanhã" quando é o caso). */
export function dayLabel(date: string, now = new Date()) {
  const today = brDateOf(now);
  const [, m, d] = date.split("-");
  const name = WEEKDAYS[weekdayOf(date)].toLowerCase();
  const full = `${name}, ${d}/${m}`;
  if (date === today) return `hoje, ${d}/${m}`;
  if (date === addDays(today, 1)) return `amanhã, ${d}/${m}`;
  return full.replace(/^(segunda|terça|quarta|quinta|sexta)/, "$1-feira");
}

/** "sábado, 21/11 às 14:00" */
export function formatSchedule(at: Date, now = new Date()) {
  return `${dayLabel(brDateOf(at), now)} às ${brTimeOf(at)}`;
}

/** Normaliza "9h", "9", "09:00", "9:30" -> "09:00" / "09:30". Inválido -> null. */
export function normalizeTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?:[:h](\d{2})?)?h?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Lista de horários digitada no painel ("9h, 11h, 14:30") -> ["09:00", "11:00", "14:30"]. */
export function parseTimes(raw: string): { times: string[] } | { error: string } {
  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  const times: string[] = [];
  for (const p of parts) {
    const t = normalizeTime(p);
    if (!t) return { error: `Horário inválido: "${p}". Use, por exemplo, 9h, 14h ou 15:30.` };
    if (!times.includes(t)) times.push(t);
  }
  if (times.length === 0) return { error: "Informe pelo menos um horário de retirada ou entrega." };
  if (times.length > 24) return { error: "Informe no máximo 24 horários." };
  return { times: times.sort() };
}

/** Datas fechadas digitadas no painel ("25/12, 01/01/2027") -> ["2026-12-25", "2027-01-01"]. */
export function parseClosedDates(raw: string, now = new Date()): { dates: string[] } | { error: string } {
  const today = brDateOf(now);
  const year = Number(today.slice(0, 4));
  const dates: string[] = [];
  for (const p of raw.split(/[,;\s]+/).filter(Boolean)) {
    const m = p.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (!m) return { error: `Data inválida: "${p}". Use dia/mês, por exemplo 25/12.` };
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : year;
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return { error: `Data inválida: "${p}".` };
    let iso = probe.toISOString().slice(0, 10);
    // Sem ano e já passou: é a do ano que vem.
    if (!m[3] && iso < today) {
      y += 1;
      iso = new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10);
    }
    if (iso >= today && !dates.includes(iso)) dates.push(iso);
  }
  return { dates: dates.sort().slice(0, 60) };
}

/** "25/12, 01/01" para mostrar no formulário. */
export function formatClosedDates(dates: string[]) {
  return dates.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`).join(", ");
}

export type PreorderDay = { date: string; label: string; times: string[] };

/**
 * Dias e horários que o cliente pode escolher agora. `taken` = encomendas já marcadas
 * por dia ("2026-11-21" -> 3), para respeitar o limite diário.
 */
export function availableDays(rules: PreorderRules, now = new Date(), taken: Record<string, number> = {}): PreorderDay[] {
  const earliest = now.getTime() + rules.preorderMinHours * 60 * 60_000;
  const today = brDateOf(now);
  const days: PreorderDay[] = [];
  const maxDays = Math.max(1, Math.min(rules.preorderMaxDays, 180));
  for (let i = 0; i <= maxDays; i++) {
    const date = addDays(today, i);
    if (!rules.preorderWeekdays.includes(weekdayOf(date))) continue;
    if (rules.preorderClosedDates.includes(date)) continue;
    if (rules.preorderDailyLimit && (taken[date] ?? 0) >= rules.preorderDailyLimit) continue;
    const times = rules.preorderTimes.filter((t) => brDateTime(date, t).getTime() >= earliest);
    if (times.length === 0) continue;
    days.push({ date, label: shortDayLabel(date), times });
  }
  return days;
}

/** Confere no servidor o dia e horário escolhidos. */
export function validateSchedule(
  rules: PreorderRules,
  date: string | undefined,
  time: string | undefined,
  now = new Date(),
  takenOnDay = 0,
): { ok: true; scheduledFor: Date } | { ok: false; error: string } {
  if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return { ok: false, error: "Escolha o dia e o horário da encomenda." };
  const day = availableDays(rules, now, { [date]: takenOnDay }).find((d) => d.date === date);
  if (!day) {
    if (rules.preorderDailyLimit && takenOnDay >= rules.preorderDailyLimit)
      return { ok: false, error: "A agenda deste dia lotou. Escolha outro dia." };
    return { ok: false, error: `Este dia não está disponível. As encomendas precisam de ${minHoursText(rules.preorderMinHours)} de antecedência.` };
  }
  if (!day.times.includes(time)) return { ok: false, error: "Este horário não está disponível. Escolha outro." };
  return { ok: true, scheduledFor: brDateTime(date, time) };
}

/** "48 horas", "2 dias", "1 semana". */
export function minHoursText(hours: number) {
  if (hours % 168 === 0) return hours === 168 ? "1 semana" : `${hours / 168} semanas`;
  if (hours >= 24 && hours % 24 === 0) return hours === 24 ? "1 dia" : `${hours / 24} dias`;
  return hours === 1 ? "1 hora" : `${hours} horas`;
}

/** Valor mínimo de uma cobrança online (Asaas). Igual a MIN_ONLINE_PAYMENT_CENTS. */
const MIN_CHARGE = 500;

/**
 * Sinal da encomenda, em centavos. null = sem sinal (0%) ou pagamento integral (100%).
 * Arredonda para cima nos centavos e nunca fica abaixo do mínimo de uma cobrança online.
 */
export function depositFor(totalCents: number, percent: number): number | null {
  if (percent <= 0 || percent >= 100 || totalCents <= 0) return null;
  const value = Math.ceil((totalCents * percent) / 100);
  const atLeast = Math.min(totalCents, Math.max(value, MIN_CHARGE));
  return atLeast >= totalCents ? null : atLeast;
}

/** O sinal já foi pago? Online (Asaas) ou marcado pela loja. */
export function depositPaid(o: { depositCents: number | null; depositPaidAt: Date | null; paymentStatus: string }) {
  return !!o.depositCents && (o.paymentStatus === "PAID" || !!o.depositPaidAt);
}

/** Quanto falta o cliente pagar na retirada/entrega. */
export function balanceDue(o: { totalCents: number; depositCents: number | null; depositPaidAt: Date | null; paymentStatus: string }) {
  if (o.paymentStatus === "PAID" && !o.depositCents) return 0;
  return depositPaid(o) ? o.totalCents - o.depositCents! : o.totalCents;
}

/** Texto curto do sinal: "Sinal de 50% (R$ 60,00) para confirmar". */
export function depositText(percent: number, depositCents: number | null) {
  if (percent >= 100) return "Pagamento antecipado para confirmar";
  if (!depositCents) return "";
  return `Sinal de ${percent}% (${formatBRL(depositCents)}) para confirmar`;
}

/** Quantidade total de cada produto para produzir, somando as encomendas (agenda do dia). */
export function productionList(orders: { items: { name: string; quantity: number }[] }[]) {
  const map = new Map<string, number>();
  for (const o of orders) for (const i of o.items) map.set(i.name, (map.get(i.name) ?? 0) + i.quantity);
  return [...map.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}
