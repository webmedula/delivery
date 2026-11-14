import { describe, expect, it } from "vitest";
import { canEnableOnlinePayments, eventForPaymentStatus, paymentUpdateFor } from "./payment-events";
import { open, seal } from "./secret-box";

const now = new Date("2026-11-14T12:00:00Z");
const SECRET = "x".repeat(40);

describe("paymentUpdateFor", () => {
  it("pagamento confirmado marca o pedido como pago", () => {
    for (const ev of ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"])
      expect(paymentUpdateFor(ev, { paymentStatus: "AWAITING", status: "PENDING" }, now)).toEqual({ paymentStatus: "PAID", paidAt: now });
  });
  it("não repete quando já está pago (CONFIRMED depois RECEIVED no cartão)", () => {
    expect(paymentUpdateFor("PAYMENT_RECEIVED", { paymentStatus: "PAID", status: "PREPARING" }, now)).toBeNull();
  });
  it("pagou depois de vencer: o pedido volta para a loja", () => {
    expect(paymentUpdateFor("PAYMENT_RECEIVED", { paymentStatus: "EXPIRED", status: "CANCELED" }, now)).toEqual({
      paymentStatus: "PAID", paidAt: now, status: "PENDING",
    });
  });
  it("cobrança vencida ou apagada cancela só pedido ainda esperando", () => {
    expect(paymentUpdateFor("PAYMENT_OVERDUE", { paymentStatus: "AWAITING", status: "PENDING" })).toEqual({ paymentStatus: "EXPIRED", status: "CANCELED" });
    expect(paymentUpdateFor("PAYMENT_DELETED", { paymentStatus: "AWAITING", status: "PENDING" })).toEqual({ paymentStatus: "EXPIRED", status: "CANCELED" });
    expect(paymentUpdateFor("PAYMENT_OVERDUE", { paymentStatus: "PAID", status: "PREPARING" })).toBeNull();
  });
  it("estorno marca como estornado sem mexer no andamento", () => {
    expect(paymentUpdateFor("PAYMENT_REFUNDED", { paymentStatus: "PAID", status: "CANCELED" })).toEqual({ paymentStatus: "REFUNDED" });
    expect(paymentUpdateFor("PAYMENT_REFUNDED", { paymentStatus: "REFUNDED", status: "CANCELED" })).toBeNull();
  });
  it("ignora eventos desconhecidos", () => {
    expect(paymentUpdateFor("PAYMENT_CREATED", { paymentStatus: "AWAITING", status: "PENDING" })).toBeNull();
  });
});

describe("eventForPaymentStatus", () => {
  it("traduz a situação consultada na API", () => {
    expect(eventForPaymentStatus("RECEIVED")).toBe("PAYMENT_RECEIVED");
    expect(eventForPaymentStatus("CONFIRMED")).toBe("PAYMENT_CONFIRMED");
    expect(eventForPaymentStatus("OVERDUE")).toBe("PAYMENT_OVERDUE");
    expect(eventForPaymentStatus("PENDING")).toBeNull();
  });
});

describe("canEnableOnlinePayments", () => {
  it("em produção exige conta aprovada; no sandbox libera antes", () => {
    const pending = { asaasApiKeyEnc: "v1.x", asaasAccountStatus: "PENDING" };
    expect(canEnableOnlinePayments(pending, false)).toBe(false);
    expect(canEnableOnlinePayments(pending, true)).toBe(true);
    expect(canEnableOnlinePayments({ ...pending, asaasAccountStatus: "APPROVED" }, false)).toBe(true);
    expect(canEnableOnlinePayments({ asaasApiKeyEnc: null, asaasAccountStatus: "APPROVED" }, true)).toBe(false);
  });
});

describe("secret-box", () => {
  it("criptografa e abre de volta", () => {
    const sealed = seal("$aact_chave_da_subconta", SECRET);
    expect(sealed).not.toContain("aact");
    expect(open(sealed, SECRET)).toBe("$aact_chave_da_subconta");
  });
  it("não abre com outro segredo nem adulterado", () => {
    const sealed = seal("abc", SECRET);
    expect(() => open(sealed, "y".repeat(40))).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("xyz").toString("base64url");
    expect(() => open(parts.join("."), SECRET)).toThrow();
  });
});
