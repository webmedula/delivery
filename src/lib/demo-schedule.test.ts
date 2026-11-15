import { describe, expect, it } from "vitest";
import { demoResetDue } from "./demo-schedule";

// 07:00 UTC = 04:00 em Brasília
const at = (iso: string) => new Date(iso);

describe("recriação automática das lojas demo", () => {
  it("não roda antes das 4h de Brasília", () => {
    expect(demoResetDue(at("2026-11-15T06:59:00Z"), null)).toBe(false);
  });
  it("roda às 4h se nunca rodou", () => {
    expect(demoResetDue(at("2026-11-15T07:00:00Z"), null)).toBe(true);
  });
  it("roda uma vez por dia", () => {
    expect(demoResetDue(at("2026-11-15T09:00:00Z"), at("2026-11-15T07:05:00Z"))).toBe(false);
    expect(demoResetDue(at("2026-11-16T07:10:00Z"), at("2026-11-15T07:05:00Z"))).toBe(true);
  });
  it("se o app estava fora às 4h, roda quando voltar no mesmo dia", () => {
    expect(demoResetDue(at("2026-11-15T15:00:00Z"), at("2026-11-14T07:05:00Z"))).toBe(true);
  });
  it("respeita outra hora configurada", () => {
    expect(demoResetDue(at("2026-11-15T07:00:00Z"), null, 5)).toBe(false);
  });
});
