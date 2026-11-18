import { describe, expect, it } from "vitest";
import { cepToUf, parseShippingMethods, formatDays, formatShippingAddress, isCorreiosCode, normalizeTrackingCode, priceFor, resolveShipping, shippingOptions, type ShippingMethodRow } from "./shipping";

const pac: ShippingMethodRow = {
  id: "pac", name: "PAC", sameStateCents: 1990, southeastCents: 2490, southCents: 2990, midwestCents: 3490, northeastCents: 3990, northCents: null,
  daysMin: 3, daysMax: 8, active: true,
};
const sedex: ShippingMethodRow = { ...pac, id: "sedex", name: "SEDEX", sameStateCents: 2990, southeastCents: 3990, southCents: 4590, midwestCents: 5290, northeastCents: 5990, northCents: 6990, daysMin: 1, daysMax: 3 };
const rules = { originUf: "SP", freeAboveCents: 29900 };

describe("cepToUf", () => {
  it("acha o estado pelas faixas dos Correios", () => {
    expect(cepToUf("01310-100")).toBe("SP");
    expect(cepToUf("20040-002")).toBe("RJ");
    expect(cepToUf("70040010")).toBe("DF");
    expect(cepToUf("74000-000")).toBe("GO");
    expect(cepToUf("69301-000")).toBe("RR");
    expect(cepToUf("69900-000")).toBe("AC");
    expect(cepToUf("90010-000")).toBe("RS");
    expect(cepToUf("88010-000")).toBe("SC");
  });
  it("recusa CEP incompleto ou inexistente", () => {
    expect(cepToUf("1234")).toBeNull();
    expect(cepToUf("00000-000")).toBeNull();
  });
});

describe("shippingOptions", () => {
  it("usa o preço do mesmo estado e ordena do mais barato", () => {
    const r = shippingOptions([sedex, pac], rules, "13010-000", 10000);
    expect(r.ok && r.options.map((o) => [o.name, o.feeCents])).toEqual([["PAC", 1990], ["SEDEX", 2990]]);
  });
  it("usa o preço da região para outros estados", () => {
    const r = shippingOptions([pac, sedex], rules, "30110-000", 10000); // MG
    expect(r.ok && r.options[0].feeCents).toBe(2490);
    expect(priceFor(pac, "BA", "SP")).toBe(3990);
  });
  it("tira a forma que não envia para a região", () => {
    const r = shippingOptions([pac, sedex], rules, "66000-000", 10000); // PA, Norte
    expect(r.ok && r.options.map((o) => o.name)).toEqual(["SEDEX"]);
    const none = shippingOptions([pac], rules, "66000-000", 10000);
    expect(none.ok).toBe(false);
  });
  it("frete grátis só na opção mais barata, a partir do valor", () => {
    const r = shippingOptions([pac, sedex], rules, "01310-100", 29900);
    expect(r.ok && r.options.map((o) => [o.name, o.feeCents, o.free])).toEqual([["PAC", 0, true], ["SEDEX", 2990, false]]);
    const below = shippingOptions([pac, sedex], rules, "01310-100", 29899);
    expect(below.ok && below.options[0].feeCents).toBe(1990);
  });
  it("ignora forma desligada", () => {
    const r = shippingOptions([{ ...pac, active: false }, sedex], rules, "01310-100", 0);
    expect(r.ok && r.options.map((o) => o.name)).toEqual(["SEDEX"]);
  });
});

describe("resolveShipping", () => {
  it("confere a opção escolhida", () => {
    const r = resolveShipping([pac, sedex], rules, "01310100", "sedex", 0);
    expect(r.ok && r.option.feeCents).toBe(2990);
    expect(resolveShipping([pac, sedex], rules, "01310100", "outra", 0).ok).toBe(false);
    expect(resolveShipping([pac, sedex], rules, "66000000", "pac", 0).ok).toBe(false);
  });
});

describe("textos", () => {
  it("prazo", () => {
    expect(formatDays(3, 8)).toBe("3 a 8 dias úteis");
    expect(formatDays(1, 1)).toBe("1 dia útil");
    expect(formatDays(null, null)).toBe("");
  });
  it("endereço", () => {
    expect(formatShippingAddress({ cep: "13010000", street: "Rua Barão de Jaguara", number: "900", complement: "sala 2", district: "Centro", city: "Campinas", uf: "SP" }))
      .toBe("Rua Barão de Jaguara, 900, sala 2 - Centro, Campinas/SP - CEP 13010-000");
  });
  it("rastreio", () => {
    expect(normalizeTrackingCode(" qb 123456789 br ")).toBe("QB123456789BR");
    expect(isCorreiosCode("QB123456789BR")).toBe(true);
    expect(isCorreiosCode("JAD12345")).toBe(false);
  });
});

describe("parseShippingMethods", () => {
  const money = (s: string) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
  it("valida e converte", () => {
    const r = parseShippingMethods(JSON.stringify([{ name: " PAC ", sameState: "19,90", north: "", daysMin: "3", daysMax: "8" }, { name: "", sameState: "" }]), money);
    expect(r.ok && r.methods).toEqual([expect.objectContaining({ name: "PAC", sameStateCents: 1990, northCents: null, daysMin: 3, daysMax: 8, position: 0 })]);
  });
  it("recusa sem nome, sem preço ou prazo invertido", () => {
    expect(parseShippingMethods(JSON.stringify([{ sameState: "10" }]), money).ok).toBe(false);
    expect(parseShippingMethods(JSON.stringify([{ name: "PAC" }]), money).ok).toBe(false);
    expect(parseShippingMethods(JSON.stringify([{ name: "PAC", south: "10", daysMin: "9", daysMax: "3" }]), money).ok).toBe(false);
  });
});
