import Link from "next/link";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { modulesFor, termsFor } from "@/lib/niche";
import { createCategory, deleteCategory, deleteProduct, toggleProduct } from "../actions";
import { ProductForm } from "@/components/ProductForm";
import { formatDuration } from "@/lib/booking";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const { storeId, store } = await requireStoreUser();
  const modules = modulesFor(store);
  const terms = termsFor(store.businessType);
  const [categories, products] = await Promise.all([
    db.category.findMany({ where: { storeId }, orderBy: { position: "asc" } }),
    db.product.findMany({ where: { storeId }, orderBy: { position: "asc" }, include: { category: true, variants: { where: { active: true } } } }),
  ]);
  const limit = store.plan.maxProducts;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">{modules.booking ? "Novo serviço" : "Novo produto"}</h2>
          <p className="text-xs text-stone-500">{products.length}{limit > 0 ? ` de ${limit}` : ""} {modules.booking ? "serviços" : "produtos"} no plano {store.plan.name}</p>
          <ProductForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} variants={modules.variants} service={modules.booking} examplePrice={terms.productExample} />
        </section>
        <section className="card space-y-3">
          <h2 className="font-semibold">Categorias</h2>
          <form action={createCategory} className="flex gap-2">
            <input name="name" placeholder={terms.categoryPlaceholder} className="input" required />
            <button className="btn">Adicionar</button>
          </form>
          <ul className="divide-y divide-stone-100 text-sm">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                {c.name}
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-red-600 hover:underline">Excluir</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card lg:col-span-3">
        <h2 className="mb-3 font-semibold">{modules.booking ? "Serviços da agenda" : `Produtos do ${terms.catalogLower}`}</h2>
        {products.length === 0 && <p className="text-sm text-stone-500">Cadastre seu primeiro {modules.booking ? "serviço" : "produto"} ao lado.</p>}
        <ul className="divide-y divide-stone-100">
          {products.map((p) => {
            const stock = p.variants.length > 0
              ? p.variants.every((v) => v.stock === null) ? null : p.variants.reduce((s, v) => s + (v.stock ?? 0), 0)
              : p.stock;
            const soldOut = p.variants.length > 0 ? p.variants.every((v) => v.stock === 0) : p.stock === 0;
            return (
              <li key={p.id} className="flex items-center gap-3 py-3">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-12 w-12 flex-none rounded-lg bg-stone-100 object-cover" />
                ) : (
                  <div className="h-12 w-12 flex-none rounded-lg bg-stone-100" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/painel/cardapio/${p.id}`} className={`font-medium hover:underline ${p.available ? "" : "text-stone-400 line-through"}`}>{p.name}</Link>
                  <p className="text-xs text-stone-500">
                    {p.category?.name ?? "Sem categoria"}
                    {modules.booking && ` · ${formatDuration(p.durationMinutes ?? 30)}`}
                    {p.variants.length > 0 && ` · ${p.variants.length} variações`}
                    {stock !== null && stock !== undefined && (soldOut ? <span className="font-medium text-red-600"> · esgotado</span> : ` · ${stock} em estoque`)}
                  </p>
                </div>
                <span className="text-right text-sm font-semibold">
                  {p.compareAtCents && <span className="block text-xs font-normal text-stone-400 line-through">{formatBRL(p.compareAtCents)}</span>}
                  {formatBRL(p.priceCents)}
                </span>
                <Link href={`/painel/cardapio/${p.id}`} className="btn-ghost text-xs">Editar</Link>
                <form action={toggleProduct}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn-ghost text-xs">{p.available ? "Pausar" : "Ativar"}</button>
                </form>
                <form action={deleteProduct}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-sm text-red-600 hover:underline">Excluir</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
