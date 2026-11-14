// Lojas de demonstração, para mostrar o sistema a quem está conhecendo a WebTenda.
//
// Cada loja tem cardápio com fotos, clientes, pedidos dos últimos 30 dias,
// pedidos em andamento hoje, cupons, fidelidade e uma campanha de promoção.
// Tudo é recriado do zero a cada reset (os ids da loja e do login são fixos,
// então quem estiver logado no painel continua logado).
//
// Proteções (campo Store.isDemo): sem cobrança de assinatura, sem pagamento
// online e fora dos números da administração. Os telefones dos clientes usam
// DDD 00, que não existe, para nenhum link de WhatsApp cair numa pessoa real.
//
// Uso: npm run demo        (apaga e recria as lojas demo)
//      DEMO_STORES=1 no servidor cria as que faltarem a cada subida do app.

import type { DiscountType, FulfillmentType, OrderStatus, PaymentMethod, Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const DEMO_EMAIL_DOMAIN = "demo.webtenda.com.br";
export const DEFAULT_DEMO_PASSWORD = "demo1234";

type Item = [name: string, description: string, priceCents: number, imageUrl: string];

type DemoStore = {
  key: string;
  color: string; // cor do cardápio
  slug: string;
  name: string;
  description: string;
  address: string;
  deliveryFeeCents: number;
  minOrderCents: number;
  acceptsPickup: boolean;
  loyalty: { ordersRequired: number; type: DiscountType; value: number; minOrderCents: number };
  coupons: { code: string; type: DiscountType; value: number; minOrderCents?: number; firstOrderOnly?: boolean; maxUses?: number; expiresInDays?: number }[];
  campaign: { name: string; message: string; coupon: string };
  orders: number; // pedidos dos últimos 30 dias
  itemsPerOrder: [min: number, max: number];
  hours: [from: number, to: number]; // horário de pico dos pedidos (hora de Brasília)
  menu: Record<string, Item[]>;
};

// Fotos gratuitas do Unsplash (licença Unsplash: uso comercial liberado, sem atribuição obrigatória),
// carregadas direto do CDN deles, como o Unsplash pede.
const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&h=400&q=70`;

export const DEMO_STORES: DemoStore[] = [
  {
    key: "burger",
    color: "#ea580c",
    slug: "brasa-burger",
    name: "Brasa Burger",
    description: "Hambúrguer artesanal na brasa, blend da casa de 160g e pão brioche.",
    address: "Rua das Palmeiras, 120 - Centro",
    deliveryFeeCents: 600,
    minOrderCents: 2500,
    acceptsPickup: true,
    loyalty: { ordersRequired: 8, type: "FIXED", value: 2000, minOrderCents: 3000 },
    coupons: [
      { code: "PRIMEIRA10", type: "PERCENT", value: 10, firstOrderOnly: true },
      { code: "COMBO5", type: "FIXED", value: 500, minOrderCents: 5000, expiresInDays: 20 },
    ],
    campaign: { name: "Terça do Burger", message: "Oi {nome}! Hoje é terça do burger na {loja}: use o cupom {cupom} e peça em {link}", coupon: "COMBO5" },
    orders: 72,
    itemsPerOrder: [1, 3],
    hours: [18, 24],
    menu: {
      Burgers: [
        ["Brasa Clássico", "Blend 160g, queijo prato, alface, tomate e maionese da casa", 2990, img("1757834787931-ddd70f3379a5")],
        ["Brasa Bacon", "Blend 160g, cheddar, bacon crocante e cebola caramelizada", 3490, img("1766589221421-db1640fe64db")],
        ["Duplo Smash", "Dois smash de 90g, queijo americano duplo e picles", 3290, img("1572802419224-296b0aeee0d9")],
        ["Chicken Crispy", "Sobrecoxa empanada, coleslaw e molho de mostarda e mel", 2890, img("1705131186176-1c7cdb830815")],
        ["Veggie da Horta", "Hambúrguer de grão-de-bico, rúcula, tomate e maionese verde", 2790, img("1788601405384-c749fb2147f9")],
      ],
      Combos: [
        ["Combo Clássico", "Brasa Clássico + batata média + refrigerante lata", 4290, img("1763689389824-dd2cea2e5772")],
        ["Combo Casal", "2 Brasa Bacon + batata grande + 2 refrigerantes", 8490, img("1764201494609-fc2724d1e132")],
      ],
      Acompanhamentos: [
        ["Batata frita", "Porção de 300g com sal e alecrim", 1690, img("1541592106381-b31e9677c0e5")],
        ["Batata com cheddar e bacon", "Porção de 300g", 2390, img("1743193711514-4f7bc5d78d4d")],
        ["Onion rings", "Anéis de cebola empanados, 10 unidades", 1890, img("1645066803695-f0dbe2c33e42")],
      ],
      Bebidas: [
        ["Refrigerante lata", "Cola, guaraná ou limão, 350ml", 650, img("1629654613528-5d0a2e4166de")],
        ["Milkshake", "Chocolate, morango ou baunilha, 400ml", 1890, img("1775708838877-a3b8d7383c31")],
        ["Água sem gás", "500ml", 400, img("1523362628745-0c100150b504")],
      ],
      Sobremesas: [["Brownie", "Brownie de chocolate meio amargo com nozes", 1290, img("1636743715220-d8f8dd900b87")]],
    },
  },
  {
    key: "pizza",
    color: "#be123c",
    slug: "forno-da-vila",
    name: "Forno da Vila",
    description: "Pizza de fermentação natural assada no forno a lenha. Grande com 8 fatias.",
    address: "Av. Brasil, 845 - Vila Nova",
    deliveryFeeCents: 800,
    minOrderCents: 4000,
    acceptsPickup: true,
    loyalty: { ordersRequired: 10, type: "PERCENT", value: 50, minOrderCents: 4000 },
    coupons: [
      { code: "BEMVINDO15", type: "PERCENT", value: 15, firstOrderOnly: true },
      { code: "SEXTOU", type: "FIXED", value: 1000, minOrderCents: 7000, maxUses: 100 },
    ],
    campaign: { name: "Sexta da pizza", message: "{nome}, sextou! Na {loja} você ganha R$ 10 de desconto com o cupom {cupom}. Peça aqui: {link}", coupon: "SEXTOU" },
    orders: 64,
    itemsPerOrder: [1, 3],
    hours: [18, 23],
    menu: {
      "Pizzas tradicionais": [
        ["Margherita", "Molho de tomate, muçarela, manjericão e azeite", 5490, img("1772494047915-79042d21eb09")],
        ["Calabresa", "Calabresa, champignon, azeitonas e muçarela", 5290, img("1604382354936-07c5d9983bd3")],
        ["Presunto com champignon", "Presunto, champignon fresco e muçarela", 5890, img("1692737580563-7ba2d896f0f6")],
        ["Frango com catupiry", "Frango desfiado temperado e catupiry original", 5990, img("1767065603441-61923212f80c")],
        ["Quatro queijos", "Muçarela, provolone, parmesão e gorgonzola", 6290, img("1627461985459-51600559fffe")],
      ],
      "Pizzas especiais": [
        ["Pepperoni", "Pepperoni artesanal e muçarela de búfala", 6890, img("1777891257674-36c5532e6654")],
        ["Rúcula com tomate seco", "Muçarela de búfala, rúcula e tomate seco", 6590, img("1598023696416-0193a0bcd302")],
      ],
      "Pizzas doces": [
        ["Chocolate com morango", "Chocolate ao leite e morangos frescos", 5490, img("1767114916329-9b5649724379")],
      ],
      Bebidas: [
        ["Refrigerante 2L", "Cola ou guaraná", 1390, img("1667450673236-62126ce038a8")],
        ["Suco de laranja", "Natural, 500ml", 990, img("1613478223719-2ab802602423")],
        ["Cerveja long neck", "Pilsen, 330ml", 1190, img("1644085159285-5fd924740cb3")],
      ],
    },
  },
  {
    key: "acai",
    color: "#6d28d9",
    slug: "acai-da-praia",
    name: "Açaí da Praia",
    description: "Açaí cremoso batido na hora, com frutas e complementos à vontade.",
    address: "Rua do Sol, 32 - Praia Grande",
    deliveryFeeCents: 400,
    minOrderCents: 1500,
    acceptsPickup: true,
    loyalty: { ordersRequired: 6, type: "PERCENT", value: 100, minOrderCents: 1800 },
    coupons: [
      { code: "VERAO20", type: "PERCENT", value: 20, minOrderCents: 3000, expiresInDays: 30 },
      { code: "PRIMEIROACAI", type: "FIXED", value: 500, firstOrderOnly: true },
    ],
    campaign: { name: "Calor de verão", message: "Oi {nome}, tá calor né? 🍧 Use {cupom} e ganhe 20% no seu açaí da {loja}: {link}", coupon: "VERAO20" },
    orders: 58,
    itemsPerOrder: [1, 2],
    hours: [13, 22],
    menu: {
      "Copos de açaí": [
        ["Açaí 300ml", "Com granola, banana e leite condensado", 1690, img("1627308594190-a057cd4bfac8")],
        ["Açaí 500ml", "Com granola, banana, morango e mel", 2290, img("1777113310717-1047d523f2ad")],
        ["Açaí 700ml", "Banana, blueberry, granola e coco ralado", 2890, img("1787406988073-c6ed034788ad")],
      ],
      Tigelas: [
        ["Tigela de frutas vermelhas", "Açaí 500g com morango, mirtilo e granola", 3290, img("1610441009633-b6ca9c6d4be2")],
        ["Tigela fit", "Açaí sem açúcar, banana, pasta de amendoim e chia", 2990, img("1684403731883-67a71a793d2d")],
      ],
      "Cremes e sorvetes": [
        ["Sorvete com banana e granola", "Duas bolas de creme, banana e granola", 2190, img("1676515841519-7bb498597c73")],
        ["Sorvete 2 bolas", "Sabores do dia (informe na observação)", 1390, img("1570197788417-0e82375c9371")],
      ],
      Bebidas: [
        ["Vitamina de frutas vermelhas", "Açaí, morango e banana batidos, 500ml", 1590, img("1615478503562-ec2d8aa0e24e")],
        ["Coco gelado", "Coco verde com canudo", 700, img("1761576881090-a3253f7e53dc")],
      ],
    },
  },
  {
    key: "mercado",
    color: "#15803d",
    slug: "mercadinho-bom-preco",
    name: "Mercadinho Bom Preço",
    description: "Hortifruti, padaria e mercearia do bairro, entregue na sua porta em até 1 hora.",
    address: "Rua São José, 410 - Jardim América",
    deliveryFeeCents: 500,
    minOrderCents: 3000,
    acceptsPickup: true,
    loyalty: { ordersRequired: 10, type: "FIXED", value: 1500, minOrderCents: 5000 },
    coupons: [
      { code: "FRETEGRATIS", type: "FIXED", value: 500, minOrderCents: 8000 },
      { code: "VIZINHO10", type: "PERCENT", value: 10, firstOrderOnly: true },
    ],
    campaign: { name: "Feira de sábado", message: "Bom dia, {nome}! Sábado tem feira na {loja}. Pedidos acima de R$ 80 com o cupom {cupom} saem sem frete: {link}", coupon: "FRETEGRATIS" },
    orders: 44,
    itemsPerOrder: [3, 7],
    hours: [8, 20],
    menu: {
      Hortifruti: [
        ["Banana prata (kg)", "Aproximadamente 7 unidades", 699, img("1768672991601-e72e8005142c")],
        ["Tomate (kg)", "Tomate italiano selecionado", 899, img("1582284540020-8acbe03f4924")],
        ["Alface", "Unidade, cultivo hidropônico", 399, img("1640958904159-51ae08bd3412")],
        ["Maçã gala (kg)", "Aproximadamente 6 unidades", 1090, img("1560806887-1e4cd0b6cbd6")],
      ],
      Padaria: [
        ["Pão francês (10 un.)", "Saindo do forno a cada 2 horas", 890, img("1671036437036-0b1f11c80941")],
        ["Bolo de cenoura", "Fatia generosa, feito na casa", 1890, img("1676300186098-9b5ae9916e3c")],
      ],
      Mercearia: [
        ["Arroz tipo 1 (5kg)", "Grãos longos e finos", 2690, img("1586201375761-83865001e31c")],
        ["Feijão carioca (1kg)", "Tipo 1", 849, img("1787657513507-a657058d5f25")],
        ["Café em grãos (500g)", "Torra média, 100% arábica", 1990, img("1606486544554-164d98da4889")],
        ["Ovos (dúzia)", "Granja local", 1190, img("1758450286526-2d1588a6f322")],
      ],
      Bebidas: [
        ["Leite integral (1L)", "Caixa", 599, img("1550583724-b2692b85b150")],
        ["Refrigerante 2L", "Cola ou guaraná", 1190, img("1648569883125-d01072540b4c")],
      ],
      Limpeza: [["Detergente 500ml", "Neutro, com bico dosador", 299, img("1590610994353-7b0e7546e681")]],
    },
  },
];

// Clientes fictícios. Telefones com DDD 00 (não existe): links de WhatsApp não chegam a ninguém.
const CUSTOMERS = [
  "Mariana Souza", "Rafael Lima", "Juliana Alves", "Bruno Costa", "Camila Rocha", "Lucas Martins", "Fernanda Dias",
  "Thiago Ribeiro", "Patrícia Gomes", "Diego Ferreira", "Aline Carvalho", "Gustavo Pereira", "Beatriz Nunes",
  "Rodrigo Araújo", "Larissa Mendes", "Felipe Barbosa",
];
const STREETS = [
  "Rua das Flores", "Rua Sete de Setembro", "Av. Paulista", "Rua Tiradentes", "Rua Santos Dumont", "Rua Rio Branco",
  "Rua Bela Vista", "Av. das Américas", "Rua XV de Novembro", "Rua Dom Pedro II",
];
const NOTES = ["Sem cebola, por favor", "Interfone quebrado, pode ligar", "Capricha no molho!", "Troco para 100", "Deixar na portaria", null, null, null, null, null];

const DAY = 24 * 60 * 60 * 1000;
const FAR_FUTURE = new Date("2099-12-31T00:00:00Z");

/** Gerador pseudoaleatório com semente: os mesmos dados a cada reset. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Tempo estimado mostrado ao cliente: [entrega mín, entrega máx, retirada mín, retirada máx].
const DEMO_ETA: Record<string, [number, number, number, number]> = {
  burger: [40, 55, 15, 25],
  pizza: [45, 60, 25, 35],
  acai: [25, 40, 10, 15],
  mercado: [30, 50, 15, 20],
};
// Bairros dos clientes demo; a taxa sobe a partir da taxa base da loja.
const DEMO_ZONES: [name: string, extraCents: number][] = [["Centro", 0], ["Vila Nova", 100], ["Boa Vista", 200], ["Jardim América", 300]];

export const demoStoreId = (key: string) => `demo-store-${key}`;
const demoUserId = (key: string) => `demo-user-${key}`;
export const demoEmail = (key: string) => `${key}@${DEMO_EMAIL_DOMAIN}`;

function demoWhatsapp() {
  const digits = (process.env.DEMO_WHATSAPP ?? "").replace(/\D/g, "");
  return digits.length >= 12 && digits.length <= 13 ? digits : null;
}

function discount(type: DiscountType, value: number, subtotal: number) {
  return type === "PERCENT" ? Math.round((subtotal * value) / 100) : Math.min(value, subtotal);
}

/** Confere se nenhum slug ou e-mail das lojas demo foi tomado por uma loja de verdade. */
async function assertFree(db: PrismaClient, demo: DemoStore) {
  const store = await db.store.findUnique({ where: { slug: demo.slug } });
  if (store && store.id !== demoStoreId(demo.key))
    throw new Error(`O endereço /loja/${demo.slug} já é de uma loja real (${store.name}). Nada foi alterado.`);
  const user = await db.user.findUnique({ where: { email: demoEmail(demo.key) } });
  if (user && user.id !== demoUserId(demo.key)) throw new Error(`O e-mail ${demoEmail(demo.key)} já está em uso. Nada foi alterado.`);
}

async function createDemoStore(tx: Prisma.TransactionClient, demo: DemoStore, planId: string, passwordHash: string, now: Date) {
  const rand = rng(demo.key);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const storeId = demoStoreId(demo.key);
  const loyalty = demo.loyalty;

  await tx.store.create({
    data: {
      id: storeId,
      slug: demo.slug,
      name: demo.name,
      description: demo.description,
      address: demo.address,
      whatsapp: demoWhatsapp(),
      logoUrl: `/demo/logos/${demo.slug}.svg`,
      themeColor: demo.color,
      pixKey: `pix@${demo.slug}.exemplo`,
      isOpen: true,
      isDemo: true,
      deliveryFeeCents: demo.deliveryFeeCents,
      minOrderCents: demo.minOrderCents,
      deliveryMinutesMin: DEMO_ETA[demo.key]?.[0] ?? null,
      deliveryMinutesMax: DEMO_ETA[demo.key]?.[1] ?? null,
      pickupMinutesMin: DEMO_ETA[demo.key]?.[2] ?? null,
      pickupMinutesMax: DEMO_ETA[demo.key]?.[3] ?? null,
      acceptsDelivery: true,
      acceptsPickup: demo.acceptsPickup,
      planId,
      subscriptionStatus: "ACTIVE",
      currentPeriodEnd: FAR_FUTURE,
      loyaltyEnabled: true,
      loyaltyOrdersRequired: loyalty.ordersRequired,
      loyaltyRewardType: loyalty.type,
      loyaltyRewardValue: loyalty.value,
      loyaltyMinOrderCents: loyalty.minOrderCents,
      createdAt: new Date(now.getTime() - 45 * DAY),
      users: { create: { id: demoUserId(demo.key), name: `${demo.name} (demo)`, email: demoEmail(demo.key), passwordHash } },
    },
  });

  // Bairros e taxas
  const zones = DEMO_ZONES.map(([name, extra], i) => ({ id: `${storeId}-z${i}`, storeId, name, feeCents: demo.deliveryFeeCents + extra }));
  await tx.deliveryZone.createMany({ data: zones });
  const zoneOf = (address: string) => zones.find((z) => address.endsWith(`- ${z.name}`)) ?? zones[0];

  // Entregadores (telefone com DDD 00, como os clientes). Link fixo para a demo: /entregador/demo-<slug>-leo
  const couriers = [
    { id: `${storeId}-k0`, storeId, name: "Leo Martins", phone: `0099${String(7000000 + demo.key.length * 11).padStart(7, "0")}`, token: `demo-${demo.slug}-leo` },
    { id: `${storeId}-k1`, storeId, name: "Duda Ferreira", phone: `0099${String(7100000 + demo.key.length * 11).padStart(7, "0")}`, token: `demo-${demo.slug}-duda` },
  ];
  await tx.courier.createMany({ data: couriers });

  // Cardápio
  const products: { id: string; name: string; priceCents: number }[] = [];
  let position = 0;
  for (const [i, [category, items]] of Object.entries(demo.menu).entries()) {
    const cat = await tx.category.create({ data: { storeId, name: category, position: i } });
    for (const [name, description, priceCents, image] of items) {
      const id = `${storeId}-p${position}`;
      products.push({ id, name, priceCents });
      await tx.product.create({ data: { id, storeId, categoryId: cat.id, name, description, priceCents, imageUrl: image, position: position++ } });
    }
  }

  // Cupons
  const coupons = new Map<string, string>();
  for (const c of demo.coupons) {
    const coupon = await tx.coupon.create({
      data: {
        storeId,
        code: c.code,
        type: c.type,
        value: c.value,
        minOrderCents: c.minOrderCents ?? 0,
        firstOrderOnly: c.firstOrderOnly ?? false,
        maxUses: c.maxUses ?? 0,
        expiresAt: c.expiresInDays ? new Date(now.getTime() + c.expiresInDays * DAY) : null,
        createdAt: new Date(now.getTime() - 40 * DAY),
      },
    });
    coupons.set(c.code, coupon.id);
  }
  const firstOrderCoupon = demo.coupons.find((c) => c.firstOrderOnly);
  const otherCoupon = demo.coupons.find((c) => !c.firstOrderOnly);

  // Clientes: os primeiros pedem bastante (clientes fiéis), os últimos quase nada.
  const customers = CUSTOMERS.slice(0, demo.key === "mercado" ? 12 : 16).map((name, i) => ({
    id: `${storeId}-c${i}`,
    storeId,
    name,
    phone: `009${String(8100_0000 + i * 1373 + demo.key.length * 17).padStart(8, "0")}`,
    marketingOptIn: i % 4 !== 3,
    address: `${pick(STREETS)}, ${between(10, 1500)} - ${pick(["Centro", "Jardim América", "Vila Nova", "Boa Vista"])}`,
    weight: Math.max(1, 12 - i),
    createdAt: new Date(now.getTime() - between(31, 44) * DAY),
  }));
  await tx.customer.createMany({
    data: customers.map(({ id, storeId, name, phone, marketingOptIn, createdAt }) => ({ id, storeId, name, phone, marketingOptIn, createdAt, updatedAt: createdAt })),
  });
  await tx.customerAddress.createMany({ data: customers.map((c) => ({ customerId: c.id, address: c.address, lastUsedAt: now })) });
  const totalWeight = customers.reduce((s, c) => s + c.weight, 0);
  const weightedCustomer = () => {
    let r = rand() * totalWeight;
    for (const c of customers) if ((r -= c.weight) < 0) return c;
    return customers[0];
  };

  // Pedidos: histórico dos últimos 30 dias + alguns em andamento agora.
  type Draft = { at: Date; customer: (typeof customers)[number]; status: OrderStatus };
  const drafts: Draft[] = [];
  const [fromHour, toHour] = demo.hours;
  for (let i = 0; i < demo.orders; i++) {
    const day = between(1, 30);
    const at = new Date(now.getTime() - day * DAY);
    // hora de Brasília (UTC-3)
    at.setUTCHours(fromHour + 3 + Math.floor(rand() * (toHour - fromHour)), between(0, 59), between(0, 59), 0);
    while (at.getTime() > now.getTime() - 3 * 60 * 60_000) at.setTime(at.getTime() - DAY); // histórico fica no passado
    drafts.push({ at, customer: weightedCustomer(), status: rand() < 0.06 ? "CANCELED" : "COMPLETED" });
  }
  // Mariana fica a 1 pedido da recompensa, Rafael já tem a recompensa liberada.
  const stampsOf = (c: (typeof customers)[number]) => drafts.filter((d) => d.customer === c && d.status === "COMPLETED").length;
  for (const [customer, target] of [[customers[0], loyalty.ordersRequired - 1], [customers[1], loyalty.ordersRequired]] as const) {
    for (const d of drafts) if (d.customer === customer && stampsOf(customer) > target) d.customer = customers[customers.length - 1];
    while (stampsOf(customer) < target) {
      const at = new Date(now.getTime() - between(1, 28) * DAY);
      at.setUTCHours(fromHour + 4, between(0, 59), 0, 0);
      drafts.push({ at, customer, status: "COMPLETED" });
    }
  }
  const live: OrderStatus[] = ["PENDING", "PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"];
  live.forEach((status, i) => {
    drafts.push({ at: new Date(now.getTime() - (5 + i * 9) * 60_000), customer: customers[2 + ((i * 2) % (customers.length - 3))], status });
  });
  drafts.sort((a, b) => a.at.getTime() - b.at.getTime());

  const seen = new Set<string>();
  const orders: Prisma.OrderCreateManyInput[] = [];
  const items: Prisma.OrderItemCreateManyInput[] = [];
  drafts.forEach((d, i) => {
    const id = `${storeId}-o${i + 1}`;
    const chosen = new Map<string, number>();
    const count = between(...demo.itemsPerOrder);
    while (chosen.size < Math.min(count, products.length)) {
      const p = pick(products);
      chosen.set(p.id, (chosen.get(p.id) ?? 0) + (rand() < 0.25 ? 2 : 1));
    }
    // Todo pedido atinge o mínimo da loja; os dos clientes fiéis valem selo de fidelidade.
    const minimum = Math.max(demo.minOrderCents, d.customer === customers[0] || d.customer === customers[1] ? loyalty.minOrderCents : 0);
    const sum = () => [...chosen].reduce((s, [pid, q]) => s + products.find((x) => x.id === pid)!.priceCents * q, 0);
    while (sum() < minimum) {
      const p = pick(products);
      chosen.set(p.id, (chosen.get(p.id) ?? 0) + 1);
    }
    let subtotal = 0;
    for (const [productId, quantity] of chosen) {
      const p = products.find((x) => x.id === productId)!;
      subtotal += p.priceCents * quantity;
      items.push({ orderId: id, productId, name: p.name, unitPriceCents: p.priceCents, quantity });
    }
    const fulfillment: FulfillmentType =
      d.status === "READY_FOR_PICKUP" || (d.status !== "OUT_FOR_DELIVERY" && demo.acceptsPickup && rand() < 0.2) ? "PICKUP" : "DELIVERY";
    const zone = fulfillment === "DELIVERY" ? zoneOf(d.customer.address) : null;
    const fee = zone?.feeCents ?? 0;
    const eta = DEMO_ETA[demo.key];
    const [etaMin, etaMax] = fulfillment === "DELIVERY" ? [eta?.[0], eta?.[1]] : [eta?.[2], eta?.[3]];
    // Datas de cada etapa: histórico concluído em um tempo realista; os em andamento até a etapa atual.
    const minutes = (m: number) => new Date(d.at.getTime() + m * 60_000);
    const total0 = (etaMin ?? 40) + between(-8, 12);
    const reached = (s: OrderStatus[]) => s.includes(d.status);
    const acceptedAt = reached(["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "COMPLETED"]) ? minutes(between(1, 3)) : null;
    const dispatchedAt = reached(["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "COMPLETED"])
      ? minutes(d.status === "COMPLETED" ? Math.round(total0 * 0.6) : Math.max(4, Math.round((now.getTime() - d.at.getTime()) / 60_000) - 3))
      : null;
    const completedAt = d.status === "COMPLETED" ? minutes(total0) : null;
    const courier =
      fulfillment !== "DELIVERY" ? null
      : d.status === "OUT_FOR_DELIVERY" ? couriers[0]
      : d.status === "PREPARING" ? couriers[1]
      : d.status === "COMPLETED" ? couriers[rand() < 0.6 ? 0 : 1]
      : null;
    let discountCents = 0;
    let couponCode: string | null = null;
    const first = !seen.has(d.customer.id);
    seen.add(d.customer.id);
    if (first && firstOrderCoupon && rand() < 0.5) couponCode = firstOrderCoupon.code;
    else if (otherCoupon && subtotal >= (otherCoupon.minOrderCents ?? 0) && rand() < 0.15) couponCode = otherCoupon.code;
    if (couponCode) {
      const c = demo.coupons.find((x) => x.code === couponCode)!;
      discountCents = discount(c.type, c.value, subtotal);
    }
    const paymentMethod: PaymentMethod = pick(["PIX", "PIX", "CARD_ON_DELIVERY", "CARD_ON_DELIVERY", "CASH"]);
    const total = subtotal + fee - discountCents;
    orders.push({
      id,
      storeId,
      number: i + 1,
      status: d.status,
      fulfillment,
      paymentMethod,
      changeForCents: paymentMethod === "CASH" ? ([2000, 5000, 10000, 20000].find((v) => v > total) ?? Math.ceil(total / 10000) * 10000) : null,
      customerId: d.customer.id,
      customerName: d.customer.name,
      customerPhone: d.customer.phone,
      address: fulfillment === "DELIVERY" ? d.customer.address : null,
      deliveryZoneId: zone?.id ?? null,
      deliveryZoneName: zone?.name ?? null,
      etaMinutesMin: etaMin ?? null,
      etaMinutesMax: etaMax ?? null,
      courierId: courier?.id ?? null,
      courierName: courier?.name ?? null,
      acceptedAt,
      dispatchedAt,
      completedAt,
      canceledAt: d.status === "CANCELED" ? minutes(between(2, 10)) : null,
      notes: pick(NOTES),
      subtotalCents: subtotal,
      deliveryFeeCents: fee,
      discountCents,
      couponId: couponCode ? coupons.get(couponCode)! : null,
      couponCode,
      totalCents: total,
      createdAt: d.at,
      updatedAt: d.at,
    });
  });
  await tx.order.createMany({ data: orders });
  await tx.orderItem.createMany({ data: items });

  // Campanha: metade dos destinatários já recebeu a mensagem.
  const audience = customers.filter((c) => c.marketingOptIn);
  await tx.campaign.create({
    data: {
      storeId,
      name: demo.campaign.name,
      message: demo.campaign.message,
      audience: "all",
      couponId: coupons.get(demo.campaign.coupon) ?? null,
      createdAt: new Date(now.getTime() - 2 * DAY),
      recipients: {
        create: audience.map((c, i) => ({ customerId: c.id, sentAt: i < audience.length / 2 ? new Date(now.getTime() - 2 * DAY + i * 60_000) : null })),
      },
    },
  });
}

export type DemoResult = { name: string; slug: string; email: string; created: boolean }[];

/**
 * Cria as lojas demo. Com reset (padrão), apaga e recria todas; sem reset, só cria as que faltam.
 * Nunca toca em lojas reais: se um slug ou e-mail das demos estiver em uso, para antes de mudar qualquer coisa.
 */
export async function setupDemoStores(db: PrismaClient, { reset = true, password }: { reset?: boolean; password?: string } = {}): Promise<DemoResult> {
  for (const demo of DEMO_STORES) await assertFree(db, demo);
  const plan = (await db.plan.findUnique({ where: { code: "completo" } })) ?? (await db.plan.findFirstOrThrow({ orderBy: { priceCents: "desc" } }));
  const passwordHash = await bcrypt.hash(password || process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD, 10);
  const now = new Date();
  const result: DemoResult = [];
  for (const demo of DEMO_STORES) {
    const id = demoStoreId(demo.key);
    const exists = !!(await db.store.findUnique({ where: { id }, select: { id: true } }));
    if (exists && !reset) {
      result.push({ name: demo.name, slug: demo.slug, email: demoEmail(demo.key), created: false });
      continue;
    }
    await db.$transaction(
      async (tx) => {
        await tx.store.deleteMany({ where: { id, isDemo: true } });
        await createDemoStore(tx, demo, plan.id, passwordHash, now);
      },
      { timeout: 60_000 },
    );
    result.push({ name: demo.name, slug: demo.slug, email: demoEmail(demo.key), created: true });
  }
  return result;
}

/** Apaga todas as lojas demo (e tudo delas). */
export async function removeDemoStores(db: PrismaClient) {
  const { count } = await db.store.deleteMany({ where: { isDemo: true } });
  return count;
}
