import { describe, expect, it } from "vitest";
import {
  currentStepIndex, customerMessage, etaFor, formatEta, guessZone, nextStep, parseMinutesRange, resolveDeliveryFee, stampsFor,
} from "./delivery";

describe("nextStep", () => {
  it("leva o pedido de entrega até entregue", () => {
    expect(nextStep("PENDING", "DELIVERY")?.status).toBe("PREPARING");
    expect(nextStep("PREPARING", "DELIVERY")?.status).toBe("OUT_FOR_DELIVERY");
    expect(nextStep("OUT_FOR_DELIVERY", "DELIVERY")?.status).toBe("COMPLETED");
    expect(nextStep("COMPLETED", "DELIVERY")).toBeNull();
  });
  it("retirada passa por pronto para retirar", () => {
    expect(nextStep("PREPARING", "PICKUP")?.status).toBe("READY_FOR_PICKUP");
    expect(nextStep("READY_FOR_PICKUP", "PICKUP")?.label).toBe("Cliente retirou");
  });
});

describe("stampsFor", () => {
  const now = new Date("2026-11-14T20:00:00Z");
  it("marca as etapas puladas", () => {
    expect(stampsFor("COMPLETED", {}, now)).toEqual({ acceptedAt: now, dispatchedAt: now, completedAt: now });
  });
  it("não sobrescreve datas existentes", () => {
    const before = new Date("2026-11-14T19:00:00Z");
    expect(stampsFor("OUT_FOR_DELIVERY", { acceptedAt: before }, now)).toEqual({ dispatchedAt: now });
  });
  it("limpa a conclusão quando a loja volta uma etapa", () => {
    expect(stampsFor("PREPARING", { acceptedAt: now, dispatchedAt: now, completedAt: now }, now)).toEqual({ completedAt: null, dispatchedAt: null });
  });
});

describe("etapas do cliente", () => {
  it("acha a etapa atual", () => {
    expect(currentStepIndex("CONFIRMED", "DELIVERY")).toBe(1);
    expect(currentStepIndex("READY_FOR_PICKUP", "PICKUP")).toBe(2);
    expect(currentStepIndex("CANCELED", "DELIVERY")).toBe(-1);
  });
});

describe("tempo estimado", () => {
  const rules = { deliveryMinutesMin: 40, deliveryMinutesMax: 60, pickupMinutesMin: 20, pickupMinutesMax: null };
  it("usa a faixa do tipo de pedido", () => {
    expect(etaFor(rules, "DELIVERY")).toEqual({ min: 40, max: 60 });
    expect(etaFor(rules, "PICKUP")).toEqual({ min: 20, max: 20 });
    expect(etaFor({ ...rules, deliveryMinutesMin: null }, "DELIVERY")).toBeNull();
  });
  it("mostra a hora de Brasília", () => {
    expect(formatEta(new Date("2026-11-14T22:00:00Z"), 40, 60)).toBe("19:40 e 20:00");
    expect(formatEta(new Date("2026-11-14T22:00:00Z"), 30, null)).toBe("19:30");
  });
  it("valida o formulário", () => {
    expect(parseMinutesRange("40", "60")).toEqual({ min: 40, max: 60 });
    expect(parseMinutesRange("", "")).toEqual({ min: null, max: null });
    expect(parseMinutesRange("60", "40")).toHaveProperty("error");
    expect(parseMinutesRange("abc", "")).toHaveProperty("error");
  });
});

describe("taxa por bairro", () => {
  const zones = [
    { id: "a", name: "Centro", feeCents: 500, active: true },
    { id: "b", name: "Jardim América", feeCents: 800, active: true },
    { id: "c", name: "Distrito", feeCents: 1500, active: false },
  ];
  it("sem bairros usa a taxa única", () => {
    expect(resolveDeliveryFee([], undefined, 600)).toEqual({ ok: true, feeCents: 600, zone: null });
  });
  it("com bairros exige um bairro ativo", () => {
    expect(resolveDeliveryFee(zones, "b", 600)).toMatchObject({ ok: true, feeCents: 800 });
    expect(resolveDeliveryFee(zones, undefined, 600).ok).toBe(false);
    expect(resolveDeliveryFee(zones, "c", 600).ok).toBe(false);
  });
  it("reconhece o bairro no endereço salvo", () => {
    expect(guessZone(zones, "Rua X, 10 - Jardim América")?.id).toBe("b");
    expect(guessZone(zones, "Rua Y, 5 - centro")?.id).toBe("a");
    expect(guessZone(zones, "Rua Z - Distrito")).toBeUndefined();
  });
});

describe("mensagem para o cliente", () => {
  const order = {
    number: 42, status: "OUT_FOR_DELIVERY" as const, fulfillment: "DELIVERY" as const, customerName: "Ana Souza",
    totalCents: 5290, paymentStatus: "NONE", paymentMethod: "CASH", changeForCents: 10000,
    createdAt: new Date("2026-11-14T22:00:00Z"), etaMinutesMin: 40, etaMinutesMax: 60,
  };
  it("avisa que saiu, com valor e troco", () => {
    const msg = customerMessage(order, "Brasa Burger", "https://x/loja/b/pedido/1").replace(/\s/g, " ");
    expect(msg).toContain("Olá, Ana!");
    expect(msg).toContain("saiu para entrega");
    expect(msg).toContain("troco para R$ 100,00");
    expect(msg).toContain("Acompanhe aqui: https://x/loja/b/pedido/1");
  });
  it("não cobra pedido já pago e mostra a previsão no preparo", () => {
    const msg = customerMessage({ ...order, status: "PREPARING", paymentStatus: "PAID" }, "Brasa Burger", "u");
    expect(msg).toContain("entre 19:40 e 20:00");
    expect(msg).not.toContain("Valor");
  });
});

describe("dia no horário de Brasília", () => {
  it("pedido às 22h de Brasília ainda é do mesmo dia", async () => {
    const { brDate, brDayStart } = await import("./delivery");
    expect(brDate(new Date("2026-11-15T01:00:00Z"))).toBe("2026-11-14");
    expect(brDayStart("2026-11-14").toISOString()).toBe("2026-11-14T03:00:00.000Z");
  });
});
