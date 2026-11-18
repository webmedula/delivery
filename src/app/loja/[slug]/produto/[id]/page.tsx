import type { Metadata } from "next";
import { formatBRL } from "@/lib/money";
import { getStore, renderStore } from "@/lib/storefront-page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; id: string }> };

// Link de um produto para compartilhar no Instagram e no WhatsApp: a prévia mostra a foto e o preço.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const store = await getStore(slug);
  const product = store?.products.find((p) => p.id === id);
  if (!store || !product) return { title: "Produto não encontrado" };
  const title = `${product.name} · ${formatBRL(product.priceCents)} · ${store.name}`;
  const description = product.description ?? store.description ?? undefined;
  return { title, description, openGraph: { title, description, images: product.imageUrl ? [product.imageUrl] : undefined } };
}

export default async function ProductPage({ params }: Props) {
  const { slug, id } = await params;
  return renderStore(slug, id);
}
