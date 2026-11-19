import { describe, expect, it } from "vitest";
import { belongsTo, eventBody, googleEventId, shouldShow, type CalendarOrder } from "./calendar-event";

const order: CalendarOrder = {
  id: "cmabc123xyz",
  number: 42,
  status: "CONFIRMED",
  paymentStatus: "NONE",
  customerName: "Carlos",
  customerPhone: "11988887777",
  notes: "Degradê baixo",
  totalCents: 7000,
  depositCents: null,
  depositPaidAt: null,
  scheduledFor: new Date("2026-11-20T13:00:00Z"),
  endsAt: new Date("2026-11-20T13:50:00Z"),
  professionalId: "pro1",
  professionalName: "Rafa",
  customerConfirmedAt: null,
  items: [{ name: "Corte" }, { name: "Barba" }],
};
const opts = { storeName: "Navalha", storeAddress: "Rua A, 10", panelUrl: "https://app.webtenda.com.br/painel/agenda?dia=2026-11-20", showProfessional: true };

describe("Google Agenda", () => {
  it("id do evento só usa letras a-v e números, e é sempre o mesmo", () => {
    const id = googleEventId(order.id);
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(googleEventId(order.id)).toBe(id);
    expect(googleEventId("cmzzzwww")).toMatch(/^[a-v0-9]+$/);
  });

  it("agenda da barbearia recebe todos; a do profissional, só os dele", () => {
    expect(belongsTo(order, { professionalId: null })).toBe(true);
    expect(belongsTo(order, { professionalId: "pro1" })).toBe(true);
    expect(belongsTo(order, { professionalId: "pro2" })).toBe(false);
  });

  it("cancelado, falta e pagamento pendente não ficam na agenda", () => {
    expect(shouldShow(order)).toBe(true);
    expect(shouldShow({ ...order, status: "COMPLETED" })).toBe(true);
    expect(shouldShow({ ...order, status: "CANCELED" })).toBe(false);
    expect(shouldShow({ ...order, paymentStatus: "AWAITING" })).toBe(false);
    expect(shouldShow({ ...order, paymentStatus: "EXPIRED" })).toBe(false);
    expect(shouldShow({ ...order, paymentStatus: "PAID" })).toBe(true);
  });

  it("monta o evento com cliente, serviços, horário e link do painel", () => {
    const e = eventBody(order, opts);
    expect(e.summary).toBe("Carlos · Corte + Barba (com Rafa)");
    expect(e.start).toEqual({ dateTime: "2026-11-20T13:00:00.000Z", timeZone: "America/Sao_Paulo" });
    expect(e.end.dateTime).toBe("2026-11-20T13:50:00.000Z");
    expect(e.location).toBe("Rua A, 10");
    expect(e.description).toContain("(11) 98888-7777");
    expect(e.description).toContain("Recado: Degradê baixo");
    expect(e.description).toContain(opts.panelUrl);
    expect(eventBody(order, { ...opts, showProfessional: false }).summary).toBe("Carlos · Corte + Barba");
  });

  it("atendido ganha ✓ e sem fim vira 30 minutos", () => {
    const e = eventBody({ ...order, status: "COMPLETED", endsAt: null }, opts);
    expect(e.summary.startsWith("✓ ")).toBe(true);
    expect(e.end.dateTime).toBe("2026-11-20T13:30:00.000Z");
  });
});
