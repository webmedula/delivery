import { describe, expect, it } from "vitest";
import { addOneMonth, billingUpdateFor } from "./billing-events";
import { normalizeCpfCnpj } from "./cpf-cnpj";

const iso = (d?: Date) => d?.toISOString().slice(0, 10);

describe("billingUpdateFor", () => {
  it("pagamento recebido ativa e libera até um mês depois do vencimento", () => {
    for (const event of ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]) {
      const u = billingUpdateFor({ event, payment: { id: "pay_1", dueDate: "2026-11-26" } }, { currentPeriodEnd: null });
      expect(u?.subscriptionStatus).toBe("ACTIVE");
      expect(iso(u?.currentPeriodEnd)).toBe("2026-12-26");
    }
  });
  it("evento antigo não encurta período já pago", () => {
    const u = billingUpdateFor({ event: "PAYMENT_RECEIVED", payment: { id: "p", dueDate: "2026-10-26" } }, { currentPeriodEnd: new Date("2027-01-26T12:00:00Z") });
    expect(u).toEqual({ subscriptionStatus: "ACTIVE" });
  });
  it("atraso marca pendente a partir do vencimento", () => {
    const u = billingUpdateFor({ event: "PAYMENT_OVERDUE", payment: { id: "p", dueDate: "2026-12-26" } }, { currentPeriodEnd: new Date("2026-12-26T12:00:00Z") });
    expect(u?.subscriptionStatus).toBe("PAST_DUE");
    expect(iso(u?.currentPeriodEnd)).toBe("2026-12-26");
  });
  it("atraso de fatura antiga não derruba quem já pagou depois", () => {
    expect(billingUpdateFor({ event: "PAYMENT_OVERDUE", payment: { id: "p", dueDate: "2026-10-26" } }, { currentPeriodEnd: new Date("2027-01-26T12:00:00Z") })).toBeNull();
  });
  it("assinatura apagada cancela; eventos irrelevantes são ignorados", () => {
    expect(billingUpdateFor({ event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } }, { currentPeriodEnd: null })).toMatchObject({ subscriptionStatus: "CANCELED", clearSubscription: true });
    expect(billingUpdateFor({ event: "PAYMENT_CREATED", payment: { id: "p", dueDate: "2026-12-26" } }, { currentPeriodEnd: null })).toBeNull();
  });
  it("soma um mês sem estourar o fim do mês", () => {
    expect(iso(addOneMonth("2027-01-31"))).toBe("2027-02-28");
    expect(iso(addOneMonth("2026-12-15"))).toBe("2027-01-15");
  });
});

describe("normalizeCpfCnpj", () => {
  it("aceita CPF e CNPJ válidos, com ou sem pontuação", () => {
    expect(normalizeCpfCnpj("529.982.247-25")).toBe("52998224725");
    expect(normalizeCpfCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });
  it("recusa inválidos", () => {
    expect(normalizeCpfCnpj("111.111.111-11")).toBeNull();
    expect(normalizeCpfCnpj("529.982.247-26")).toBeNull();
    expect(normalizeCpfCnpj("123")).toBeNull();
  });
});
