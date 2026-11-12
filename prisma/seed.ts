import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const plans = [
    { code: "basico", name: "Básico", priceCents: 4990, maxProducts: 50, maxOrdersMonth: 300 },
    { code: "profissional", name: "Profissional", priceCents: 8990, maxProducts: 200, maxOrdersMonth: 0 },
    { code: "completo", name: "Completo", priceCents: 14990, maxProducts: 0, maxOrdersMonth: 0 },
  ];
  for (const p of plans) await db.plan.upsert({ where: { code: p.code }, update: p, create: p });

  // Loja de demonstração: demo@pedidolocal.dev / demo1234
  if (await db.store.findUnique({ where: { slug: "lanchonete-demo" } })) return;
  const plan = await db.plan.findUniqueOrThrow({ where: { code: "profissional" } });
  const store = await db.store.create({
    data: {
      slug: "lanchonete-demo",
      name: "Lanchonete Demo",
      description: "Lanches, porções e bebidas.",
      whatsapp: "5511999999999",
      address: "Rua Exemplo, 123 - Centro",
      pixKey: "demo@pedidolocal.dev",
      deliveryFeeCents: 500,
      minOrderCents: 2000,
      planId: plan.id,
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      users: { create: { name: "Demo", email: "demo@pedidolocal.dev", passwordHash: await bcrypt.hash("demo1234", 10) } },
    },
  });
  const menu: Record<string, [string, string, number][]> = {
    Lanches: [
      ["X-Burger", "Pão, hambúrguer 150g, queijo e maionese da casa", 2490],
      ["X-Bacon", "Pão, hambúrguer 150g, queijo, bacon e alface", 2890],
      ["X-Tudo", "Hambúrguer, ovo, bacon, presunto, queijo, salada", 3290],
    ],
    Porções: [["Batata frita", "Porção de 400g", 1990], ["Onion rings", "Porção de 300g", 2290]],
    Bebidas: [["Refrigerante lata", "350ml", 600], ["Suco natural", "500ml", 900]],
  };
  let pos = 0;
  for (const [i, [cat, items]] of Object.entries(menu).entries()) {
    const category = await db.category.create({ data: { storeId: store.id, name: cat, position: i } });
    for (const [name, description, priceCents] of items)
      await db.product.create({ data: { storeId: store.id, categoryId: category.id, name, description, priceCents, position: pos++ } });
  }
}

main().finally(() => db.$disconnect());
