import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { modulesFor } from "@/lib/niche";
import { compareSizes } from "@/lib/variants";
import { Swatch } from "@/components/ProductForm";
import { setStock } from "../actions";

export const dynamic = "force-dynamic";

const LOW = 2;
const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "baixo", label: `Acabando (até ${LOW})` },
  { key: "esgotado", label: "Esgotados" },
] as const;

type Row = { key: string; productId: string; variantId?: string; product: string; label: string; color: string | null; stock: number | null; imageUrl: string | null };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ filtro?: string; q?: string }> }) {
  const { storeId, store } = await requireStoreUser();
  if (!modulesFor(store).stock) redirect("/painel/cardapio");
  const { filtro = "todos", q = "" } = await searchParams;

  const products = await db.product.findMany({
    where: { storeId, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: { position: "asc" },
    include: { variants: { where: { active: true }, orderBy: { position: "asc" } } },
  });

  const rows: Row[] = products.flatMap((p): Row[] =>
    p.variants.length > 0
      ? [...p.variants]
          .sort((a, b) => (a.color ?? "").localeCompare(b.color ?? "", "pt-BR") || compareSizes(a.size ?? "", b.size ?? ""))
          .map((v) => ({ key: v.id, productId: p.id, variantId: v.id, product: p.name, label: [v.color, v.size].filter(Boolean).join(" · "), color: v.color, stock: v.stock, imageUrl: p.imageUrl }))
      : [{ key: p.id, productId: p.id, product: p.name, label: "", color: null, stock: p.stock, imageUrl: p.imageUrl }],
  );
  const tracked = rows.filter((r) => r.stock !== null);
  const soldOut = tracked.filter((r) => r.stock === 0).length;
  const low = tracked.filter((r) => r.stock! > 0 && r.stock! <= LOW).length;
  const pieces = tracked.reduce((s, r) => s + r.stock!, 0);
  const shown = rows.filter((r) => (filtro === "esgotado" ? r.stock === 0 : filtro === "baixo" ? r.stock !== null && r.stock <= LOW : true));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Estoque</h1>
          <p className="text-sm text-stone-500">As peças saem do estoque quando o pedido chega e voltam se ele for cancelado.</p>
        </div>
        <form className="flex gap-2">
          <input type="hidden" name="filtro" value={filtro} />
          <input name="q" defaultValue={q} placeholder="Buscar produto" className="input w-48!" />
          <button className="btn-ghost">Buscar</button>
        </form>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="card"><p className="text-sm text-stone-500">Peças em estoque</p><p className="text-2xl font-bold">{pieces}</p></div>
        <Link href="?filtro=baixo" className="card block hover:border-amber-300"><p className="text-sm text-stone-500">Acabando</p><p className="text-2xl font-bold text-amber-600">{low}</p></Link>
        <Link href="?filtro=esgotado" className="card block hover:border-red-300"><p className="text-sm text-stone-500">Esgotados</p><p className="text-2xl font-bold text-red-600">{soldOut}</p></Link>
      </div>
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`?filtro=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full px-3 py-1 text-sm font-medium ${filtro === f.key ? "bg-brand-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}>
            {f.label}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr><th className="px-3 py-2 font-medium">Produto</th><th className="px-3 py-2 font-medium">Variação</th><th className="px-3 py-2 font-medium">Estoque</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {shown.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-stone-500">Nada por aqui.</td></tr>}
            {shown.map((r) => (
              <tr key={r.key}>
                <td className="px-3 py-2">
                  <Link href={`/painel/cardapio/${r.productId}`} className="flex items-center gap-2 font-medium hover:underline">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.imageUrl ? <img src={r.imageUrl} alt="" className="h-8 w-8 rounded-md object-cover" /> : <span className="h-8 w-8 rounded-md bg-stone-100" />}
                    {r.product}
                  </Link>
                </td>
                <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5">{r.color && <Swatch color={r.color} />}{r.label || "—"}</span></td>
                <td className="px-3 py-2">
                  <form action={setStock} className="flex items-center gap-2">
                    <input type="hidden" name="productId" value={r.productId} />
                    {r.variantId && <input type="hidden" name="variantId" value={r.variantId} />}
                    <input
                      name="stock"
                      defaultValue={r.stock ?? ""}
                      placeholder="—"
                      inputMode="numeric"
                      aria-label={`Estoque de ${r.product} ${r.label}`}
                      className={`input w-20! py-1! ${r.stock === 0 ? "border-red-300 bg-red-50 text-red-700" : r.stock !== null && r.stock <= LOW ? "border-amber-300 bg-amber-50" : ""}`}
                    />
                    <button className="btn-ghost px-2! py-1! text-xs">Salvar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">Vazio = não controla estoque daquele item (ele nunca aparece como esgotado).</p>
    </div>
  );
}
