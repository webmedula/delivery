import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_STORES } from "../../prisma/demo";

describe("lojas demo", () => {
  it("têm slugs e chaves únicos", () => {
    expect(new Set(DEMO_STORES.map((s) => s.slug)).size).toBe(DEMO_STORES.length);
    expect(new Set(DEMO_STORES.map((s) => s.key)).size).toBe(DEMO_STORES.length);
  });

  it("todas as fotos de produto existem em public/demo", () => {
    for (const store of DEMO_STORES)
      for (const items of Object.values(store.menu))
        for (const [, , , image] of items) expect(existsSync(join(process.cwd(), "public/demo", `${image}.svg`)), image).toBe(true);
  });

  it("cupom da campanha existe na loja", () => {
    for (const store of DEMO_STORES) expect(store.coupons.map((c) => c.code)).toContain(store.campaign.coupon);
  });
});
