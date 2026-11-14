import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_STORES } from "../../prisma/demo";

describe("lojas demo", () => {
  it("têm slugs e chaves únicos", () => {
    expect(new Set(DEMO_STORES.map((s) => s.slug)).size).toBe(DEMO_STORES.length);
    expect(new Set(DEMO_STORES.map((s) => s.key)).size).toBe(DEMO_STORES.length);
  });

  it("cada produto tem uma foto do Unsplash, sem repetir", () => {
    const urls = DEMO_STORES.flatMap((s) => Object.values(s.menu).flat().map((item) => item[3]));
    for (const url of urls) expect(url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-[\w-]+\?/);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("cada loja tem logo em public/demo/logos e cor válida", () => {
    for (const store of DEMO_STORES) {
      expect(existsSync(join(process.cwd(), "public/demo/logos", `${store.slug}.svg`)), store.slug).toBe(true);
      expect(store.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("cupom da campanha existe na loja", () => {
    for (const store of DEMO_STORES) expect(store.coupons.map((c) => c.code)).toContain(store.campaign.coupon);
  });
});
