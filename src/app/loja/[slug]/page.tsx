import type { Metadata } from "next";
import { absoluteImageUrl } from "@/lib/image-url";
import { siteUrl } from "@/lib/store-url";
import { getStore, renderStore } from "@/lib/storefront-page";
import { termsFor } from "@/lib/niche";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const store = await getStore((await params).slug);
  if (!store) return { title: "Loja não encontrada" };
  const title = `${store.name} · ${termsFor(store.businessType).catalog}`;
  const base = await siteUrl();
  const image = absoluteImageUrl(store.products.find((p) => p.imageUrl)?.imageUrl, base);
  return {
    title,
    description: store.description ?? undefined,
    openGraph: { title, description: store.description ?? undefined, images: image ? [image] : undefined },
    alternates: { canonical: `${base}/loja/${store.slug}` },
    // Lojas demo são só para mostrar o sistema: fora do Google.
    robots: store.isDemo ? { index: false, follow: false } : undefined,
  };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  return renderStore((await params).slug);
}
