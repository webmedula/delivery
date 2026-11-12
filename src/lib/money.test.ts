import { describe, expect, it } from "vitest";
import { parseBRLToCents } from "./money";

describe("parseBRLToCents", () => {
  it("aceita formatos brasileiros", () => {
    expect(parseBRLToCents("24,90")).toBe(2490);
    expect(parseBRLToCents("R$ 1.234,56")).toBe(123456);
    expect(parseBRLToCents("10")).toBe(1000);
    expect(parseBRLToCents("10.5")).toBe(1050);
  });
  it("recusa inválidos", () => {
    expect(parseBRLToCents("")).toBeNull();
    expect(parseBRLToCents("abc")).toBeNull();
    expect(parseBRLToCents("-5")).toBeNull();
  });
});
