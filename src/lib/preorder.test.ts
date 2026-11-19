import { describe, expect, it } from "vitest";
import {
  availableDays, balanceDue, brDateTime, dayLabel, depositFor, depositPaid, formatSchedule, minHoursText,
  parseClosedDates, parseTimes, productionList, validateSchedule, type PreorderRules,
} from "./preorder";

// Quarta-feira, 18/11/2026, 10:00 em Brasília.
const NOW = brDateTime("2026-11-18", "10:00");
const RULES: PreorderRules = {
  preorderMinHours: 48,
  preorderMaxDays: 14,
  preorderWeekdays: [2, 3, 4, 5, 6], // terça a sábado
  preorderTimes: ["09:00", "14:00", "18:00"],
  preorderDailyLimit: null,
  preorderClosedDates: [],
};

describe("agenda de encomendas", () => {
  it("respeita a antecedência mínima e os dias da semana", () => {
    const days = availableDays(RULES, NOW);
    // 48h a partir de quarta 10h = sexta 10h: sexta só tem 14h e 18h.
    expect(days[0]).toEqual({ date: "2026-11-20", label: "sex, 20/11", times: ["14:00", "18:00"] });
    expect(days[1].date).toBe("2026-11-21");
    // Domingo (22) e segunda (23) não entram.
    expect(days[2].date).toBe("2026-11-24");
    expect(days.at(-1)!.date <= "2026-12-02").toBe(true);
  });

  it("tira dias fechados e dias lotados", () => {
    const days = availableDays({ ...RULES, preorderClosedDates: ["2026-11-21"], preorderDailyLimit: 3 }, NOW, { "2026-11-20": 3 });
    expect(days.map((d) => d.date).slice(0, 2)).toEqual(["2026-11-24", "2026-11-25"]);
  });

  it("valida o dia e o horário no servidor", () => {
    expect(validateSchedule(RULES, "2026-11-20", "14:00", NOW)).toEqual({ ok: true, scheduledFor: new Date("2026-11-20T17:00:00Z") });
    expect(validateSchedule(RULES, "2026-11-20", "09:00", NOW).ok).toBe(false);
    expect(validateSchedule(RULES, "2026-11-19", "14:00", NOW)).toMatchObject({ ok: false, error: expect.stringContaining("2 dias") });
    expect(validateSchedule(RULES, "2026-11-22", "14:00", NOW).ok).toBe(false); // domingo
    expect(validateSchedule(RULES, undefined, undefined, NOW).ok).toBe(false);
    expect(validateSchedule({ ...RULES, preorderDailyLimit: 2 }, "2026-11-21", "14:00", NOW, 2)).toMatchObject({ ok: false, error: expect.stringContaining("lotou") });
  });

  it("lê horários e datas digitados no painel", () => {
    expect(parseTimes("9h, 14:30 18 9:00")).toEqual({ times: ["09:00", "14:30", "18:00"] });
    expect("error" in parseTimes("25h")).toBe(true);
    expect("error" in parseTimes("")).toBe(true);
    expect(parseClosedDates("25/12, 01/01, 10/11", NOW)).toEqual({ dates: ["2026-12-25", "2027-01-01", "2027-11-10"] });
    expect("error" in parseClosedDates("31/02", NOW)).toBe(true);
  });

  it("escreve datas em português", () => {
    expect(dayLabel("2026-11-18", NOW)).toBe("hoje, 18/11");
    expect(dayLabel("2026-11-19", NOW)).toBe("amanhã, 19/11");
    expect(dayLabel("2026-11-20", NOW)).toBe("sexta-feira, 20/11");
    expect(formatSchedule(brDateTime("2026-11-21", "14:00"), NOW)).toBe("sábado, 21/11 às 14:00");
    expect(minHoursText(48)).toBe("2 dias");
    expect(minHoursText(12)).toBe("12 horas");
    expect(minHoursText(168)).toBe("1 semana");
  });
});

describe("sinal", () => {
  it("calcula o sinal com mínimo de R$ 5 e sem passar do total", () => {
    expect(depositFor(12990, 50)).toBe(6495);
    expect(depositFor(12991, 50)).toBe(6496); // arredonda para cima
    expect(depositFor(800, 30)).toBe(500);
    expect(depositFor(450, 50)).toBeNull(); // sinal seria o total
    expect(depositFor(10000, 0)).toBeNull();
    expect(depositFor(10000, 100)).toBeNull();
  });

  it("sabe quanto falta pagar", () => {
    const base = { totalCents: 10000, depositCents: 5000, depositPaidAt: null, paymentStatus: "NONE" };
    expect(depositPaid(base)).toBe(false);
    expect(balanceDue(base)).toBe(10000);
    expect(balanceDue({ ...base, paymentStatus: "PAID" })).toBe(5000);
    expect(balanceDue({ ...base, depositPaidAt: new Date() })).toBe(5000);
    expect(balanceDue({ ...base, depositCents: null, paymentStatus: "PAID" })).toBe(0);
  });

  it("soma a produção do dia", () => {
    expect(productionList([{ items: [{ name: "Bolo", quantity: 1 }, { name: "Brigadeiro", quantity: 100 }] }, { items: [{ name: "Bolo", quantity: 2 }] }])).toEqual([
      { name: "Brigadeiro", quantity: 100 },
      { name: "Bolo", quantity: 3 },
    ]);
  });
});
