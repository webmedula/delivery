import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { canTakeOrders } from "@/lib/subscription";
import { Storefront } from "@/components/Storefront";

export const dynamic = "force-dynamic";

async function getStore(slug: string) {
  return db.store.findUnique({
    where: { slug },
    include: {
      categories: { orderBy: { position: "asc" } },
      products: { where: { available: true }, orderBy: { position: "asc" } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const store = await getStore((await params).slug);
  return { title: store ? `${store.name} · Cardápio` : "Loja não encontrada" };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const store = await getStore((await params).slug);
  if (!store) notFound();

  const accepting = store.isOpen && canTakeOrders(store);
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
        deliveryFeeCents: store.deliveryFeeCents,
        minOrderCents: store.minOrderCents,
        acceptsDelivery: store.acceptsDelivery,
        acceptsPickup: store.acceptsPickup,
        accepting,
      }}
      sections={sections.map((s) => ({
        ...s,
        products: s.products.map((p) => ({ id: p.id, name: p.name, description: p.description, priceCents: p.priceCents, imageUrl: p.imageUrl })),
      }))}
    />
  );
}
