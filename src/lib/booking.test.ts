import { describe, expect, it } from "vitest";
import {
  availability, canCustomerCancel, canDo, daySlots, describeWorkHours, formatDuration, gridBounds, icsEvent,
  parseBreak, parseWorkHours, pickProfessional, professionalReport, professionalSlots, reminderMessage, totalDuration, validateBooking,
  type BookingProfessional, type BookingRules,
} from "./booking";
import { brDateTime } from "./preorder";

const rules: BookingRules = { bookingStepMinutes: 30, bookingMinMinutes: 60, bookingMaxDays: 14, bookingClosedDates: [] };
const WEEK = ["", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-19:00", "08:00-14:00"];
const ana: BookingProfessional = { id: "ana", name: "Ana", workHours: WEEK, breakStart: "12:00", breakEnd: "13:00", serviceIds: [] };
const beto: BookingProfessional = { id: "beto", name: "Beto", workHours: ["", "", "10:00-18:00", "10:00-18:00", "10:00-18:00", "10:00-18:00", "08:00-14:00"], breakStart: null, breakEnd: null, serviceIds: ["corte"] };

// Quinta, 19/11/2026, 07:00 em Brasília.
const now = brDateTime("2026-11-19", "07:00");

describe("horários do profissional", () => {
  it("começa no expediente, pula o intervalo e termina antes do fim", () => {
    const slots = professionalSlots(ana, "2026-11-19", 60, rules, [], now);
    expect(slots[0]).toBe("09:00");
    expect(slots).toContain("11:00");
    expect(slots).not.toContain("11:30"); // 11:30-12:30 bate no almoço
    expect(slots).not.toContain("12:00");
    expect(slots).toContain("13:00");
    expect(slots[slots.length - 1]).toBe("18:00");
  });

  it("respeita a antecedência mínima", () => {
    const at = brDateTime("2026-11-19", "10:10");
    expect(professionalSlots(ana, "2026-11-19", 30, rules, [], at)[0]).toBe("11:30");
  });

  it("não oferece horário que bate com atendimento ou bloqueio", () => {
    const busy = [
      { professionalId: "ana", start: brDateTime("2026-11-19", "09:30"), end: brDateTime("2026-11-19", "10:15") },
      { professionalId: null, start: brDateTime("2026-11-19", "16:00"), end: brDateTime("2026-11-19", "19:00") },
      { professionalId: "beto", start: brDateTime("2026-11-19", "14:00"), end: brDateTime("2026-11-19", "15:00") },
    ];
    const slots = professionalSlots(ana, "2026-11-19", 30, rules, busy, now);
    expect(slots).toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).not.toContain("10:00");
    expect(slots).toContain("10:30");
    expect(slots).toContain("14:00"); // bloqueio do Beto não vale para a Ana
    expect(slots[slots.length - 1]).toBe("15:30");
  });

  it("folga e dia fechado não têm horário", () => {
    expect(professionalSlots(ana, "2026-11-22", 30, rules, [], now)).toEqual([]); // domingo
    expect(professionalSlots(ana, "2026-11-20", 30, { ...rules, bookingClosedDates: ["2026-11-20"] }, [], now)).toEqual([]);
  });
});

describe("agenda do cliente", () => {
  it("junta os profissionais e diz quem atende cada horário", () => {
    const slots = daySlots([ana, beto], "2026-11-19", 30, rules, [], now);
    expect(slots.find((s) => s.time === "09:00")!.professionalIds).toEqual(["ana"]);
    expect(slots.find((s) => s.time === "12:00")!.professionalIds).toEqual(["beto"]);
    expect(slots.find((s) => s.time === "15:00")!.professionalIds).toEqual(["ana", "beto"]);
  });

  it("lista os dias abertos, sem domingo, e mostra dia lotado sem horários", () => {
    const busy = [{ professionalId: null, start: brDateTime("2026-11-20", "00:00"), end: brDateTime("2026-11-21", "00:00") }];
    const days = availability([ana], 30, { ...rules, bookingMaxDays: 4 }, busy, now);
    expect(days.map((d) => d.date)).toEqual(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-23"]);
    expect(days[1].slots).toEqual([]);
    expect(days[2].label).toBe("sáb, 21/11");
  });

  it("hoje some quando o expediente já acabou", () => {
    const late = brDateTime("2026-11-19", "18:40");
    expect(availability([ana], 30, rules, [], late)[0].date).toBe("2026-11-20");
  });

  it("filtra por serviço", () => {
    expect(canDo(beto, ["corte"])).toBe(true);
    expect(canDo(beto, ["corte", "barba"])).toBe(false);
    expect(canDo(ana, ["corte", "barba"])).toBe(true);
  });
});

describe("validação do agendamento", () => {
  it("aceita o horário livre e escolhe o profissional com menos atendimentos", () => {
    const r = validateBooking([ana, beto], { date: "2026-11-19", time: "15:00", professionalId: null }, 45, rules, [], now, { ana: 3, beto: 1 });
    expect(r).toMatchObject({ ok: true, professionalId: "beto" });
    if (r.ok) expect(r.end.getTime() - r.start.getTime()).toBe(45 * 60_000);
  });

  it("recusa horário ocupado e dia fora da agenda", () => {
    const busy = [{ professionalId: "ana", start: brDateTime("2026-11-19", "09:00"), end: brDateTime("2026-11-19", "09:30") }];
    expect(validateBooking([ana], { date: "2026-11-19", time: "09:00", professionalId: "ana" }, 30, rules, busy, now).ok).toBe(false);
    expect(validateBooking([ana], { date: "2026-12-30", time: "09:00" }, 30, rules, [], now).ok).toBe(false);
    expect(validateBooking([ana], { date: "2026-11-19", time: "9h" }, 30, rules, [], now).ok).toBe(false);
  });

  it("pickProfessional desempata pela ordem", () => {
    expect(pickProfessional(["a", "b"], {})).toBe("a");
    expect(pickProfessional([], {})).toBeNull();
  });
});

describe("cancelamento pelo cliente", () => {
  const o = { status: "CONFIRMED", scheduledFor: brDateTime("2026-11-19", "10:00") };
  it("até X horas antes", () => {
    expect(canCustomerCancel(o, 2, brDateTime("2026-11-19", "07:59"))).toBe(true);
    expect(canCustomerCancel(o, 2, brDateTime("2026-11-19", "08:01"))).toBe(false);
    expect(canCustomerCancel(o, -1, now)).toBe(false);
    expect(canCustomerCancel({ ...o, status: "CANCELED" }, 2, now)).toBe(false);
  });
});

describe("textos e formulários", () => {
  it("duração", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h30");
    expect(totalDuration([{ durationMinutes: 30 }, { durationMinutes: null }])).toBe(60);
  });

  it("expediente", () => {
    const rows = WEEK.map((h) => ({ off: !h, start: h.slice(0, 5), end: h.slice(6) }));
    expect(parseWorkHours(rows)).toEqual({ hours: WEEK });
    expect(parseWorkHours(rows.map((r) => ({ ...r, off: true })))).toHaveProperty("error");
    expect(parseWorkHours([{ off: false, start: "18h", end: "9h" }, ...rows.slice(1)])).toHaveProperty("error");
    expect(parseBreak("12h", "13h")).toEqual({ start: "12:00", end: "13:00" });
    expect(parseBreak("", "")).toEqual({ start: null, end: null });
    expect(parseBreak("12h", "")).toHaveProperty("error");
    expect(describeWorkHours(WEEK)).toBe("seg a sex 9h–19h · sáb 8h–14h");
  });

  it("grade do dia cobre o expediente de todos", () => {
    expect(gridBounds([ana, beto], "2026-11-19")).toEqual({ start: 9 * 60, end: 19 * 60 });
    expect(gridBounds([ana], "2026-11-22")).toEqual({ start: 8 * 60, end: 20 * 60 });
  });

  it("lembrete com o link", () => {
    const msg = reminderMessage(
      { customerName: "João Silva", scheduledFor: brDateTime("2026-11-20", "14:00"), professionalName: "Ana Souza", items: [{ name: "Corte" }, { name: "Barba" }] },
      "Navalha de Ouro", "https://x/agendamento/1", now,
    );
    expect(msg).toContain("Olá, João!");
    expect(msg).toContain("Amanhã, 20/11 às 14:00");
    expect(msg).toContain("Corte + Barba com Ana");
    expect(msg).toContain("https://x/agendamento/1");
  });

  it("arquivo de calendário", () => {
    const ics = icsEvent({ uid: "1", title: "Corte; barba", start: brDateTime("2026-11-20", "14:00"), end: brDateTime("2026-11-20", "15:00"), now });
    expect(ics).toContain("DTSTART:20261120T170000Z");
    expect(ics).toContain("SUMMARY:Corte\\; barba");
  });

  it("fechamento por profissional", () => {
    const r = professionalReport(
      [{ id: "ana", name: "Ana", commissionPercent: 40 }],
      [
        { professionalId: "ana", status: "COMPLETED", totalCents: 5000, noShowAt: null },
        { professionalId: "ana", status: "COMPLETED", totalCents: 3000, noShowAt: null },
        { professionalId: "ana", status: "CANCELED", totalCents: 4000, noShowAt: new Date() },
      ],
    );
    expect(r[0]).toMatchObject({ appointments: 2, revenueCents: 8000, commissionCents: 3200, noShows: 1 });
  });
});
