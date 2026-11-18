import { describe, expect, it } from "vitest";
import { colorSwatch, compareSizes, parseVariantRows, splitList } from "./variants";

describe("parseVariantRows", () => {
  it("lê estoque, preço e ignora linhas vazias", () => {
    const r = parseVariantRows(JSON.stringify([
      { color: " Azul ", size: "M", stock: "3" },
      { color: "Azul", size: "GG", stock: "", price: "169,90" },
      { color: "", size: "" },
    ]));
    expect(r).toEqual({ ok: true, rows: [
      { id: undefined, color: "Azul", size: "M", stock: 3, priceCents: null, active: true, position: 0 },
      { id: undefined, color: "Azul", size: "GG", stock: null, priceCents: 16990, active: true, position: 1 },
    ] });
  });
  it("recusa repetidos, estoque negativo ou quebrado", () => {
    expect(parseVariantRows(JSON.stringify([{ color: "Azul", size: "M" }, { color: "azul", size: "m" }])).ok).toBe(false);
    expect(parseVariantRows(JSON.stringify([{ size: "M", stock: "-1" }])).ok).toBe(false);
    expect(parseVariantRows(JSON.stringify([{ size: "M", stock: "1.5" }])).ok).toBe(false);
    expect(parseVariantRows("{")).toMatchObject({ ok: false });
  });
});

describe("tamanhos e cores", () => {
  it("ordena tamanhos de letra e de número", () => {
    expect(["G", "PP", "GG", "M", "P"].sort(compareSizes)).toEqual(["PP", "P", "M", "G", "GG"]);
    expect(["40", "36", "38"].sort(compareSizes)).toEqual(["36", "38", "40"]);
  });
  it("separa listas sem repetir", () => {
    expect(splitList("Azul, rosa,azul ;Preto")).toEqual(["Azul", "rosa", "Preto"]);
  });
  it("acha a cor pelo nome", () => {
    expect(colorSwatch("Preto")).toBe("#1c1917");
    expect(colorSwatch("Azul royal")).toBe("#2563eb");
    expect(colorSwatch("Estampado")).toBeNull();
  });
});
