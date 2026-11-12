import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { createCategory, deleteCategory, deleteProduct, toggleProduct } from "../actions";
import { ProductForm } from "@/components/ProductForm";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const { storeId, store } = await requireStoreUser();
  const [categories, products] = await Promise.all([
    db.category.findMany({ where: { storeId }, orderBy: { position: "asc" } }),
    db.product.findMany({ where: { storeId }, orderBy: { position: "asc" }, include: { category: true } }),
  ]);
  const limit = store.plan.maxProducts;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6">
        <section className="card space-y-3">
          <h2 className="font-semibold">Categorias</h2>
          <form action={createCategory} className="flex gap-2">
            <input name="name" placeholder="Ex.: Lanches" className="input" required />
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
        <section className="card space-y-3">
          <h2 className="font-semibold">Novo produto</h2>
          <p className="text-xs text-stone-500">{products.length}{limit > 0 ? ` de ${limit}` : ""} produtos no plano {store.plan.name}</p>
          <ProductForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
        </section>
      </div>

      <section className="card lg:col-span-2">
        <h2 className="mb-3 font-semibold">Produtos</h2>
        {products.length === 0 && <p className="text-sm text-stone-500">Cadastre seu primeiro produto ao lado.</p>}
        <ul className="divide-y divide-stone-100">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <p className={`font-medium ${p.available ? "" : "text-stone-400 line-through"}`}>{p.name}</p>
                <p className="text-xs text-stone-500">{p.category?.name ?? "Sem categoria"}</p>
              </div>
              <span className="text-sm font-semibold">{formatBRL(p.priceCents)}</span>
              <form action={toggleProduct}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn-ghost text-xs">{p.available ? "Pausar" : "Ativar"}</button>
              </form>
              <form action={deleteProduct}>
                <input type="hidden" name="id" value={p.id} />
                <button className="text-sm text-red-600 hover:underline">Excluir</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
