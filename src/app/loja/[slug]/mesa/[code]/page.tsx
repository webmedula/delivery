import type { Metadata } from "next";
import { db } from "@/lib/db";
import { renderStore } from "@/lib/storefront-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; code: string }> }): Promise<Metadata> {
  const { slug, code } = await params;
  const table = await db.diningTable.findFirst({ where: { code, store: { slug } }, include: { store: { select: { name: true } } } });
  if (!table) return { title: "Mesa não encontrada" };
  // Link da mesa não deve aparecer no Google: só serve para quem está sentado nela.
  return { title: `${table.label} · ${table.store.name}`, robots: { index: false, follow: false } };
}

/** Cardápio aberto pelo QR code da mesa: o pedido vai para a cozinha com o nome da mesa. */
export default async function TablePage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  return renderStore(slug, undefined, code);
}
