import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canTakeOrders } from "@/lib/subscription";
import { Storefront } from "@/components/Storefront";
import { getLoyaltyStatus, getSessionCustomer } from "@/lib/customers";
import { describeDiscount } from "@/lib/discounts";
import { formatPhone } from "@/lib/phone";
import { onlineMethods } from "@/lib/payments";
import { etaFor, formatMinutes } from "@/lib/delivery";
import { modulesFor, termsFor } from "@/lib/niche";
import { availableDays, brDateOf, depositText, minHoursText } from "@/lib/preorder";

/** Dias e horários livres para encomenda (descontando os dias que já lotaram). */
async function preorderInfo(store: NonNullable<Awaited<ReturnType<typeof getStore>>>) {
  const now = new Date();
  const taken: Record<string, number> = {};
  if (store.preorderDailyLimit) {
    const booked = await db.order.findMany({
      where: { storeId: store.id, scheduledFor: { gte: now }, status: { not: "CANCELED" } },
      select: { scheduledFor: true },
    });
    for (const o of booked) {
      const d = brDateOf(o.scheduledFor!);
      taken[d] = (taken[d] ?? 0) + 1;
    }
  }
  return {
    days: availableDays(store, now, taken),
    minHours: minHoursText(store.preorderMinHours),
    depositPercent: store.depositPercent,
    depositNote: store.depositPercent >= 100 ? depositText(100, null) : store.depositPercent > 0 ? `Sinal de ${store.depositPercent}% para confirmar` : null,
  };
}


export async function getStore(slug: string) {
  return db.store.findUnique({
    where: { slug },
    include: {
      categories: { orderBy: { position: "asc" } },
      products: {
        where: { available: true },
        orderBy: { position: "asc" },
        include: { variants: { where: { active: true }, orderBy: { position: "asc" } } },
      },
      deliveryZones: { where: { active: true }, orderBy: { name: "asc" } },
      shippingMethods: { where: { active: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
  });
}

/** Catálogo da loja. Com productId, já abre o produto (link para compartilhar /loja/x/produto/id). */
export async function renderStore(slug: string, productId?: string) {
  const store = await getStore(slug);
  if (!store) notFound();
  if (productId && !store.products.some((p) => p.id === productId)) notFound();
  const modules = modulesFor(store);
  const terms = termsFor(store.businessType);

  const accepting = store.isOpen && canTakeOrders(store);
  const reward = { type: store.loyaltyRewardType, value: store.loyaltyRewardValue };
  const customer = await getSessionCustomer(store.id);
  const [addresses, loyalty] = customer
    ? await Promise.all([
        db.customerAddress.findMany({ where: { customerId: customer.id }, orderBy: { lastUsedAt: "desc" }, take: 5 }),
        getLoyaltyStatus(store, customer.id),
      ])
    : [[], null];
  const sections = [
    ...store.categories.map((c) => ({ id: c.id, name: c.name, products: store.products.filter((p) => p.categoryId === c.id) })),
    { id: "outros", name: "Outros", products: store.products.filter((p) => !p.categoryId) },
  ].filter((s) => s.products.length > 0);

  return (
    <Storefront
      store={{
        slug: store.slug,
        name: store.name,
        description: store.description,
        address: store.address,
        logoUrl: store.logoUrl,
        deliveryFeeCents: store.deliveryFeeCents,
        minOrderCents: store.minOrderCents,
        acceptsDelivery: store.acceptsDelivery,
        acceptsPickup: store.acceptsPickup,
        accepting,
        loyalty: store.loyaltyEnabled ? `a cada ${store.loyaltyOrdersRequired} pedidos, ganhe ${describeDiscount(reward)}` : null,
        reward: store.loyaltyEnabled ? reward : null,
        online: onlineMethods(store),
        zones: store.deliveryZones.map((z) => ({ id: z.id, name: z.name, feeCents: z.feeCents })),
        eta: {
          delivery: (() => { const e = etaFor(store, "DELIVERY"); return e && formatMinutes(e); })(),
          pickup: (() => { const e = etaFor(store, "PICKUP"); return e && formatMinutes(e); })(),
        },
        demo: store.isDemo,
        grid: modules.gridCatalog,
        whatsappCheckout: store.whatsappCheckout && !!store.whatsapp,
        shipping:
          store.acceptsShipping && store.shippingMethods.length > 0
            ? {
                originUf: store.shippingOriginUf,
                freeAboveCents: store.shippingFreeAboveCents,
                methods: store.shippingMethods.map((m) => ({
                  id: m.id, name: m.name, sameStateCents: m.sameStateCents, southeastCents: m.southeastCents, southCents: m.southCents,
                  midwestCents: m.midwestCents, northeastCents: m.northeastCents, northCents: m.northCents,
                  daysMin: m.daysMin, daysMax: m.daysMax, active: m.active,
                })),
              }
            : null,
        preorder: modules.preorder ? await preorderInfo(store) : null,
        terms: { catalog: terms.catalog, catalogLower: terms.catalogLower, emptyCatalog: terms.emptyCatalog, poweredBy: terms.poweredBy },
      }}
      initialProductId={productId}
      customer={
        customer && {
          name: customer.name,
          phone: formatPhone(customer.phone),
          marketingOptIn: customer.marketingOptIn,
          cpfCnpj: customer.cpfCnpj,
          addresses: addresses.map((a) => ({ id: a.id, address: a.address })),
          loyalty,
        }
      }
      sections={sections.map((s) => ({
        ...s,
        products: s.products.map((p) => ({
          id: p.id, name: p.name, description: p.description, priceCents: p.priceCents, imageUrl: p.imageUrl,
          images: p.images, compareAtCents: p.compareAtCents, stock: p.stock,
          variants: p.variants.map((v) => ({ id: v.id, color: v.color, size: v.size, stock: v.stock, priceCents: v.priceCents })),
        })),
      }))}
    />
  );
}
