import { describe, expect, it } from "vitest";
import { activeCall, billSummary, compareTableLabels, splitBill, tablesToCreate } from "./tables";
import { currentStepIndex, customerMessage, etaFor, nextStep } from "./delivery";
import { orderStatusText } from "./niche";
import { quoteOrder } from "./order-calc";

describe("criar mesas", () => {
  it("cria a faixa pedida e pula as que já existem", () => {
    expect(tablesToCreate("Mesa", "1", "4", ["Mesa 2"])).toEqual({ labels: ["Mesa 1", "Mesa 3", "Mesa 4"] });
    expect(tablesToCreate(" Varanda ", "7", "", [])).toEqual({ labels: ["Varanda 7"] });
    expect(tablesToCreate("", "1", "1", [])).toEqual({ labels: ["Mesa 1"] });
  });
  it("recusa faixa inválida ou grande demais", () => {
    expect(tablesToCreate("Mesa", "5", "2", [])).toHaveProperty("error");
    expect(tablesToCreate("Mesa", "1", "150", [])).toHaveProperty("error");
    expect(tablesToCreate("Mesa", "a", "", [])).toHaveProperty("error");
    expect(tablesToCreate("Mesa", "1", "2", ["mesa 1", "MESA 2"])).toHaveProperty("error");
  });
  it("ordena pelo número", () => {
    expect(["Mesa 10", "Mesa 2", "Mesa 1"].sort(compareTableLabels)).toEqual(["Mesa 1", "Mesa 2", "Mesa 10"]);
  });
});

describe("conta da mesa", () => {
  const at = new Date("2026-11-19T22:00:00Z");
  const order = (over: object) => ({
    status: "COMPLETED" as const, paymentStatus: "NONE" as const, totalCents: 1000, createdAt: at,
    items: [{ name: "Chopp", quantity: 2, unitPriceCents: 500 }], ...over,
  });
  it("soma os pedidos, agrupa os itens e desconta o que foi pago online", () => {
    const bill = billSummary([
      order({}),
      order({ paymentStatus: "PAID", totalCents: 1500, createdAt: new Date(at.getTime() + 60_000), items: [{ name: "Chopp", quantity: 1, unitPriceCents: 500 }, { name: "Fritas", quantity: 1, unitPriceCents: 1000 }] }),
      order({ status: "CANCELED", totalCents: 9999 }),
      order({ paymentStatus: "AWAITING", totalCents: 9999 }),
      order({ status: "PREPARING", totalCents: 500, items: [{ name: "Chopp", quantity: 1, unitPriceCents: 500 }] }),
    ]);
    expect(bill.orders).toBe(3);
    expect(bill.totalCents).toBe(3000);
    expect(bill.paidCents).toBe(1500);
    expect(bill.dueCents).toBe(1500);
    expect(bill.waiting).toBe(1);
    expect(bill.openSince).toEqual(at);
    expect(bill.items).toEqual([
      { name: "Chopp", quantity: 4, totalCents: 2000 },
      { name: "Fritas", quantity: 1, totalCents: 1000 },
    ]);
  });
  it("divide sem perder centavos", () => {
    expect(splitBill(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitBill(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
    expect(splitBill(500, 0)).toEqual([500]);
  });
  it("chamado expira depois de 30 minutos", () => {
    const now = new Date("2026-11-19T22:30:00Z");
    expect(activeCall({ callKind: "BILL", calledAt: new Date("2026-11-19T22:10:00Z") }, now)).toBe("BILL");
    expect(activeCall({ callKind: "WAITER", calledAt: new Date("2026-11-19T21:50:00Z") }, now)).toBeNull();
    expect(activeCall({ callKind: "outra", calledAt: now }, now)).toBeNull();
  });
});

describe("pedido na mesa no quadro e para o cliente", () => {
  it("preparo, pronto para servir e servido", () => {
    expect(nextStep("PENDING", "TABLE")?.status).toBe("PREPARING");
    expect(nextStep("PREPARING", "TABLE")).toEqual({ status: "READY_FOR_PICKUP", label: "Pronto para servir" });
    expect(nextStep("READY_FOR_PICKUP", "TABLE")).toEqual({ status: "COMPLETED", label: "Servido na mesa" });
    expect(currentStepIndex("READY_FOR_PICKUP", "TABLE")).toBe(2);
    expect(orderStatusText("READY_FOR_PICKUP", "TABLE")).toBe("Pronto, indo para a mesa");
    expect(orderStatusText("COMPLETED", "TABLE")).toBe("Servido");
  });
  it("usa o tempo de preparo da retirada", () => {
    expect(etaFor({ deliveryMinutesMin: 40, deliveryMinutesMax: 60, pickupMinutesMin: 15, pickupMinutesMax: 25 }, "TABLE")).toEqual({ min: 15, max: 25 });
  });
  it("mensagem fala da mesa", () => {
    const msg = customerMessage(
      { number: 7, status: "READY_FOR_PICKUP", fulfillment: "TABLE", customerName: "Ana", totalCents: 1000, paymentStatus: "NONE", paymentMethod: "TAB", changeForCents: null, createdAt: new Date(), etaMinutesMin: null, etaMinutesMax: null },
      "Boteco", "https://x",
    );
    expect(msg).toContain("já vai para a sua mesa");
  });
  it("sem taxa e sem pedido mínimo, mesmo com entrega desligada", () => {
    const rules = { deliveryFeeCents: 800, minOrderCents: 5000, acceptsDelivery: false, acceptsPickup: false };
    const q = quoteOrder([{ productId: "p", quantity: 1 }], [{ id: "p", name: "Chopp", priceCents: 1200, available: true }], rules, "TABLE");
    expect(q).toMatchObject({ ok: true, subtotalCents: 1200, deliveryFeeCents: 0, totalCents: 1200 });
  });
});
