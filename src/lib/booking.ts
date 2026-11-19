// Agendamento (barbearia, salão): o cliente escolhe os serviços, o profissional, o dia e
// o horário. Os horários livres saem do expediente de cada profissional, menos o intervalo,
// os atendimentos já marcados e os bloqueios. Funções puras (sem banco), para poder testar.
//
// Datas no fuso de Brasília (UTC-3, sem horário de verão), como em lib/preorder.

import { formatBRL } from "./money";
import { brDateOf, brDateTime, brTimeOf, dayLabel, normalizeTime, shortDayLabel } from "./preorder";

const DAY = 24 * 60 * 60_000;
const MIN = 60_000;

export type BookingRules = {
  bookingStepMinutes: number;
  bookingMinMinutes: number;
  bookingMaxDays: number;
  bookingClosedDates: string[];
};

export type BookingProfessional = {
  id: string;
  name: string;
  workHours: string[];
  breakStart: string | null;
  breakEnd: string | null;
  serviceIds: string[];
};

/** Período ocupado na agenda. professionalId null = vale para todos (bloqueio geral). */
export type Busy = { professionalId: string | null; start: Date; end: Date };

export type Slot = { time: string; professionalIds: string[] };
export type BookingDay = { date: string; label: string; slots: Slot[] };

/** Duração de um serviço sem duração cadastrada. */
export const DEFAULT_DURATION = 30;

export const STEP_OPTIONS = [10, 15, 20, 30, 45, 60];
export const DURATION_OPTIONS = [10, 15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240];
export const MIN_NOTICE_OPTIONS = [
  { minutes: 0, label: "Sem antecedência" },
  { minutes: 30, label: "30 minutos" },
  { minutes: 60, label: "1 hora" },
  { minutes: 120, label: "2 horas" },
  { minutes: 180, label: "3 horas" },
  { minutes: 360, label: "6 horas" },
  { minutes: 720, label: "12 horas" },
  { minutes: 1440, label: "1 dia" },
];
export const CANCEL_OPTIONS = [
  { hours: 0, label: "Até a hora do atendimento" },
  { hours: 1, label: "Até 1 hora antes" },
  { hours: 2, label: "Até 2 horas antes" },
  { hours: 3, label: "Até 3 horas antes" },
  { hours: 6, label: "Até 6 horas antes" },
  { hours: 12, label: "Até 12 horas antes" },
  { hours: 24, label: "Até 1 dia antes" },
  { hours: 48, label: "Até 2 dias antes" },
  { hours: -1, label: "Não pode cancelar pelo link" },
];

/** "09:30" -> 570 */
export function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** 570 -> "09:30" */
export function fromMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "09:00-19:00" -> { start: 540, end: 1140 }. Vazio ou inválido -> null (folga). */
export function parseWorkRange(raw: string | undefined | null): { start: number; end: number } | null {
  const m = (raw ?? "").match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!m) return null;
  const start = toMinutes(m[1]);
  const end = toMinutes(m[2]);
  return end > start ? { start, end } : null;
}

/** "1h", "30 min", "1h30" */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Tempo total dos serviços escolhidos. */
export function totalDuration(services: { durationMinutes: number | null }[]) {
  return services.reduce((s, x) => s + (x.durationMinutes || DEFAULT_DURATION), 0);
}

/** O profissional faz todos estes serviços? (lista vazia = faz todos) */
export function canDo(pro: { serviceIds: string[] }, serviceIds: string[]) {
  return pro.serviceIds.length === 0 || serviceIds.every((id) => pro.serviceIds.includes(id));
}

function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function addDays(date: string, days: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

/** Horários em que o profissional pode começar um atendimento de `duration` minutos nesse dia. */
export function professionalSlots(
  pro: BookingProfessional,
  date: string,
  duration: number,
  rules: BookingRules,
  busy: Busy[],
  now = new Date(),
): string[] {
  if (rules.bookingClosedDates.includes(date)) return [];
  const range = parseWorkRange(pro.workHours[weekdayOf(date)]);
  if (!range) return [];
  const step = Math.max(5, rules.bookingStepMinutes || 30);
  const earliest = now.getTime() + rules.bookingMinMinutes * MIN;
  const breakStart = pro.breakStart && pro.breakEnd ? toMinutes(pro.breakStart) : null;
  const breakEnd = pro.breakStart && pro.breakEnd ? toMinutes(pro.breakEnd) : null;
  const mine = busy.filter((b) => b.professionalId === null || b.professionalId === pro.id);
  const out: string[] = [];
  for (let t = range.start; t + duration <= range.end; t += step) {
    const time = fromMinutes(t);
    const start = brDateTime(date, time).getTime();
    const end = start + duration * MIN;
    if (start < earliest) continue;
    if (breakStart !== null && breakEnd !== null && overlaps(t, t + duration, breakStart, breakEnd)) continue;
    if (mine.some((b) => overlaps(start, end, b.start.getTime(), b.end.getTime()))) continue;
    out.push(time);
  }
  return out;
}

/** Horários livres do dia, juntando os profissionais (ou só o escolhido). */
export function daySlots(
  pros: BookingProfessional[],
  date: string,
  duration: number,
  rules: BookingRules,
  busy: Busy[],
  now = new Date(),
): Slot[] {
  const map = new Map<string, string[]>();
  for (const pro of pros)
    for (const time of professionalSlots(pro, date, duration, rules, busy, now)) map.set(time, [...(map.get(time) ?? []), pro.id]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, professionalIds]) => ({ time, professionalIds }));
}

/** Dias da agenda aberta (de hoje até bookingMaxDays), com os horários livres de cada um. */
export function availability(
  pros: BookingProfessional[],
  duration: number,
  rules: BookingRules,
  busy: Busy[],
  now = new Date(),
): BookingDay[] {
  const today = brDateOf(now);
  const maxDays = Math.max(0, Math.min(rules.bookingMaxDays, 90));
  const days: BookingDay[] = [];
  for (let i = 0; i <= maxDays; i++) {
    const date = addDays(today, i);
    if (rules.bookingClosedDates.includes(date)) continue;
    // Dia em que ninguém trabalha nem aparece; dia lotado aparece sem horários.
    if (!pros.some((p) => parseWorkRange(p.workHours[weekdayOf(date)]))) continue;
    const slots = daySlots(pros, date, duration, rules, busy, now);
    if (i === 0 && slots.length === 0) continue; // hoje já acabou
    days.push({ date, label: shortDayLabel(date), slots });
  }
  return days;
}

/**
 * Escolhe o profissional quando o cliente marcou "qualquer um": o que tem menos
 * atendimentos no dia (empate: a ordem da lista da loja).
 */
export function pickProfessional(candidates: string[], loadByPro: Record<string, number>) {
  return [...candidates].sort((a, b) => (loadByPro[a] ?? 0) - (loadByPro[b] ?? 0))[0] ?? null;
}

/** Confere no servidor o horário escolhido e devolve com qual profissional ele fica. */
export function validateBooking(
  pros: BookingProfessional[],
  input: { date?: string; time?: string; professionalId?: string | null },
  duration: number,
  rules: BookingRules,
  busy: Busy[],
  now = new Date(),
  loadByPro: Record<string, number> = {},
): { ok: true; start: Date; end: Date; professionalId: string } | { ok: false; error: string } {
  const { date, time } = input;
  if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return { ok: false, error: "Escolha o dia e o horário." };
  const today = brDateOf(now);
  if (date < today || date > addDays(today, Math.min(rules.bookingMaxDays, 90)))
    return { ok: false, error: "Este dia não está aberto na agenda. Escolha outro." };
  const candidates = input.professionalId ? pros.filter((p) => p.id === input.professionalId) : pros;
  if (candidates.length === 0) return { ok: false, error: "Este profissional não está atendendo este serviço. Escolha outro." };
  const slot = daySlots(candidates, date, duration, rules, busy, now).find((s) => s.time === time);
  if (!slot) return { ok: false, error: "Este horário acabou de ser ocupado. Escolha outro." };
  const professionalId = pickProfessional(slot.professionalIds, loadByPro)!;
  const start = brDateTime(date, time);
  return { ok: true, start, end: new Date(start.getTime() + duration * MIN), professionalId };
}

/** O cliente ainda pode cancelar pelo link? (cancelHours -1 = nunca) */
export function canCustomerCancel(
  o: { status: string; scheduledFor: Date | null },
  cancelHours: number,
  now = new Date(),
) {
  if (!o.scheduledFor || cancelHours < 0) return false;
  if (o.status === "CANCELED" || o.status === "COMPLETED") return false;
  return o.scheduledFor.getTime() - cancelHours * 60 * MIN > now.getTime();
}

/** "sábado, 21/11 às 14:00" */
export function formatAppointment(at: Date, now = new Date()) {
  return `${dayLabel(brDateOf(at), now)} às ${brTimeOf(at)}`;
}

/** "14:00 – 14:45" */
export function formatTimeRange(start: Date, end: Date | null) {
  return end ? `${brTimeOf(start)} – ${brTimeOf(end)}` : brTimeOf(start);
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

type MessageAppointment = {
  customerName: string;
  scheduledFor: Date;
  professionalName: string | null;
  items: { name: string }[];
};

/** Lembrete que a loja manda pelo WhatsApp, com o link para confirmar ou cancelar. */
export function reminderMessage(o: MessageAppointment, storeName: string, url: string, now = new Date()) {
  const services = o.items.map((i) => i.name).join(" + ");
  return [
    `Olá, ${firstName(o.customerName)}! Passando para lembrar do seu horário na ${storeName}:`,
    "",
    `📅 ${formatAppointment(o.scheduledFor, now).replace(/^./, (c) => c.toUpperCase())}`,
    `✂️ ${services}${o.professionalName ? ` com ${firstName(o.professionalName)}` : ""}`,
    "",
    `Confirme sua presença (ou cancele, se não puder vir) por aqui: ${url}`,
  ].join("\n");
}

/** Mensagem da loja ao confirmar um agendamento feito pelo painel (telefone, balcão). */
export function confirmationMessage(o: MessageAppointment, storeName: string, url: string, address?: string | null, now = new Date()) {
  const services = o.items.map((i) => i.name).join(" + ");
  return [
    `Olá, ${firstName(o.customerName)}! Seu horário na ${storeName} está marcado:`,
    "",
    `📅 ${formatAppointment(o.scheduledFor, now).replace(/^./, (c) => c.toUpperCase())}`,
    `✂️ ${services}${o.professionalName ? ` com ${firstName(o.professionalName)}` : ""}`,
    ...(address ? [`📍 ${address}`] : []),
    "",
    `Detalhes e cancelamento: ${url}`,
  ].join("\n");
}

/** Mensagem do cliente para a loja, depois de agendar. */
export function customerToStoreMessage(o: MessageAppointment & { number: number }, url: string, now = new Date()) {
  return [
    `Olá! Acabei de agendar pelo site (#${o.number}):`,
    `${formatAppointment(o.scheduledFor, now).replace(/^./, (c) => c.toUpperCase())}`,
    `${o.items.map((i) => i.name).join(" + ")}${o.professionalName ? ` com ${firstName(o.professionalName)}` : ""}`,
    "",
    url,
  ].join("\n");
}

const gcalDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Link "adicionar ao Google Agenda". */
export function googleCalendarUrl(e: { title: string; start: Date; end: Date; location?: string | null; details?: string }) {
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${gcalDate(e.start)}/${gcalDate(e.end)}` });
  if (e.location) params.set("location", e.location);
  if (e.details) params.set("details", e.details);
  return `https://calendar.google.com/calendar/render?${params}`;
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Arquivo .ics (iPhone, Outlook) com lembrete 2 horas antes. */
export function icsEvent(e: { uid: string; title: string; start: Date; end: Date; location?: string | null; details?: string; now?: Date }) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WebTenda//Agendamento//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@webtenda.com.br`,
    `DTSTAMP:${gcalDate(e.now ?? new Date())}`,
    `DTSTART:${gcalDate(e.start)}`,
    `DTEND:${gcalDate(e.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.details ? [`DESCRIPTION:${icsText(e.details)}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(e.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// --- Painel ---

/** Valida o expediente digitado (início e fim de cada dia). Devolve 7 textos "HH:MM-HH:MM" ou "". */
export function parseWorkHours(rows: { off: boolean; start: string; end: string }[]): { hours: string[] } | { error: string } {
  const names = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const hours: string[] = [];
  for (let d = 0; d < 7; d++) {
    const r = rows[d];
    if (!r || r.off) {
      hours.push("");
      continue;
    }
    const start = normalizeTime(r.start);
    const end = normalizeTime(r.end);
    if (!start || !end) return { error: `Horário inválido na ${names[d]}. Use, por exemplo, 9h ou 09:00.` };
    if (toMinutes(end) <= toMinutes(start)) return { error: `Na ${names[d]}, o fim do expediente precisa ser depois do início.` };
    hours.push(`${start}-${end}`);
  }
  if (hours.every((h) => !h)) return { error: "Marque pelo menos um dia de trabalho." };
  return { hours };
}

/** Intervalo (almoço) opcional: os dois vazios ou os dois preenchidos. */
export function parseBreak(startRaw: string, endRaw: string): { start: string | null; end: string | null } | { error: string } {
  if (!startRaw.trim() && !endRaw.trim()) return { start: null, end: null };
  const start = normalizeTime(startRaw);
  const end = normalizeTime(endRaw);
  if (!start || !end) return { error: "Intervalo inválido. Preencha início e fim (ex.: 12h e 13h) ou deixe os dois vazios." };
  if (toMinutes(end) <= toMinutes(start)) return { error: "O fim do intervalo precisa ser depois do início." };
  return { start, end };
}

/** "Seg a sex 9h–19h · sáb 8h–14h" */
export function describeWorkHours(hours: string[]) {
  const short = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const fmt = (m: number) => (m % 60 ? fromMinutes(m).replace(":", "h") : `${m / 60}h`);
  const groups: { days: number[]; text: string }[] = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const r = parseWorkRange(hours[d]);
    if (!r) continue;
    const text = `${fmt(r.start)}–${fmt(r.end)}`;
    const last = groups[groups.length - 1];
    const prev = last?.days[last.days.length - 1];
    if (last && last.text === text && (prev === d - 1 || (prev === 6 && d === 0))) last.days.push(d);
    else groups.push({ days: [d], text });
  }
  return groups
    .map((g) => `${g.days.length > 2 ? `${short[g.days[0]]} a ${short[g.days[g.days.length - 1]]}` : g.days.map((d) => short[d]).join(" e ")} ${g.text}`)
    .join(" · ");
}

/** Faixa de horas mostrada na grade do dia (do primeiro início ao último fim, com folga). */
export function gridBounds(pros: { workHours: string[] }[], date: string, extra: { start: Date; end: Date | null }[] = []) {
  let start = 24 * 60;
  let end = 0;
  for (const p of pros) {
    const r = parseWorkRange(p.workHours[weekdayOf(date)]);
    if (r) {
      start = Math.min(start, r.start);
      end = Math.max(end, r.end);
    }
  }
  for (const e of extra) {
    if (brDateOf(e.start) !== date) continue;
    start = Math.min(start, toMinutes(brTimeOf(e.start)));
    end = Math.max(end, e.end && brDateOf(e.end) === date ? toMinutes(brTimeOf(e.end)) : toMinutes(brTimeOf(e.start)) + 30);
  }
  if (end <= start) return { start: 8 * 60, end: 20 * 60 };
  return { start: Math.floor(start / 60) * 60, end: Math.min(24 * 60, Math.ceil(end / 60) * 60) };
}

type ReportOrder = { professionalId: string | null; status: string; totalCents: number; noShowAt: Date | null };

/** Fechamento por profissional: atendimentos concluídos, faturamento, comissão e faltas. */
export function professionalReport(pros: { id: string; name: string; commissionPercent: number | null }[], orders: ReportOrder[]) {
  return pros.map((p) => {
    const mine = orders.filter((o) => o.professionalId === p.id);
    const done = mine.filter((o) => o.status === "COMPLETED");
    const revenue = done.reduce((s, o) => s + o.totalCents, 0);
    return {
      id: p.id,
      name: p.name,
      appointments: done.length,
      revenueCents: revenue,
      commissionPercent: p.commissionPercent,
      commissionCents: p.commissionPercent ? Math.round((revenue * p.commissionPercent) / 100) : null,
      noShows: mine.filter((o) => o.noShowAt).length,
    };
  });
}

/** Texto do sinal no agendamento. */
export function bookingDepositText(percent: number, depositCents: number | null) {
  if (percent >= 100) return "Pagamento antecipado para garantir o horário";
  if (!depositCents) return "";
  return `Sinal de ${percent}% (${formatBRL(depositCents)}) para garantir o horário`;
}

/** Iniciais para o avatar do profissional sem foto. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
