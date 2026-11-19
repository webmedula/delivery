import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { modulesFor, termsFor } from "@/lib/niche";
import { ProductForm } from "@/components/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { storeId, store } = await requireStoreUser();
  const [product, categories] = await Promise.all([
    db.product.findFirst({ where: { id, storeId }, include: { variants: { orderBy: { position: "asc" } } } }),
    db.category.findMany({ where: { storeId }, orderBy: { position: "asc" } }),
  ]);
  if (!product) notFound();
  const terms = termsFor(store.businessType);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/painel/cardapio" className="text-sm text-brand-700 hover:underline">‹ Voltar {modulesFor(store).booking ? "aos serviços" : `ao ${terms.catalogLower}`}</Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{modulesFor(store).booking ? "Editar serviço" : "Editar produto"}</h1>
        {!modulesFor(store).booking && <a href={`/loja/${store.slug}/produto/${product.id}`} target="_blank" className="btn-ghost text-sm">Ver no {terms.catalogLower}</a>}
      </div>
      <section className="card">
        <ProductForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          variants={modulesFor(store).variants}
          examplePrice={terms.productExample}
          service={modulesFor(store).booking}
          product={{
            id: product.id,
            name: product.name,
            description: product.description,
            priceCents: product.priceCents,
            compareAtCents: product.compareAtCents,
            categoryId: product.categoryId,
            imageUrl: product.imageUrl,
            images: product.images,
            stock: product.stock,
            durationMinutes: product.durationMinutes,
            variants: product.variants.map((v) => ({ id: v.id, color: v.color, size: v.size, stock: v.stock, priceCents: v.priceCents, active: v.active })),
          }}
        />
      </section>
    </div>
  );
}
