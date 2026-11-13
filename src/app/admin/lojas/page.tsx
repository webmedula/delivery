import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { situationLabel, storeSituation, type StoreSituation } from "@/lib/subscription";
import { SituationBadge } from "@/components/SituationBadge";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const fmt = (d: Date | null | undefined) => (d && d.getTime() > 0 ? dateFmt.format(d) : "—");

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  await requireAdmin();
  const { q = "", situacao = "" } = await searchParams;
  const term = q.trim();

  const [stores, lastOrders] = await Promise.all([
    db.store.findMany({
      where: term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { slug: { contains: term, mode: "insensitive" } },
              { users: { some: { email: { contains: term, mode: "insensitive" } } } },
            ],
          }
        : undefined,
      include: { plan: true, users: { where: { role: "OWNER" }, take: 1 }, _count: { select: { products: true, orders: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.order.groupBy({ by: ["storeId"], _max: { createdAt: true } }),
  ]);
  const lastOrder = new Map(lastOrders.map((o) => [o.storeId, o._max.createdAt]));

  // A situação depende da data de hoje, então o filtro é aplicado aqui e não no banco.
  const rows = stores
    .map((s) => ({ store: s, situation: storeSituation(s) }))
    .filter((r) => !situacao || r.situation === situacao);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Lojas <span className="text-base font-normal text-stone-500">({rows.length})</span></h1>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por loja, link ou e-mail" className="input max-w-xs" />
        <select name="situacao" defaultValue={situacao} className="input max-w-[220px]">
          <option value="">Todas as situações</option>
          {(Object.keys(situationLabel) as StoreSituation[]).map((s) => <option key={s} value={s}>{situationLabel[s]}</option>)}
        </select>
        <button className="btn">Filtrar</button>
        {(q || situacao) && <Link href="/admin/lojas" className="btn-ghost">Limpar</Link>}
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">Loja</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Teste até / Vence em</th>
              <th className="px-4 py-3 text-right">Produtos</th>
              <th className="px-4 py-3 text-right">Pedidos</th>
              <th className="px-4 py-3">Último pedido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map(({ store: s, situation }) => (
              <tr key={s.id} className="hover:bg-stone-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/lojas/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.name}</Link>
                  <p className="text-xs text-stone-500">/loja/{s.slug}</p>
                </td>
                <td className="px-4 py-3 text-stone-600">{s.users[0]?.email ?? "—"}</td>
                <td className="px-4 py-3">{s.plan.name}<p className="text-xs text-stone-500">{formatBRL(s.plan.priceCents)}</p></td>
                <td className="px-4 py-3"><SituationBadge situation={situation} /></td>
                <td className="px-4 py-3 text-stone-600">{s.subscriptionStatus === "TRIALING" ? fmt(s.trialEndsAt) : fmt(s.currentPeriodEnd)}</td>
                <td className="px-4 py-3 text-right">{s._count.products}</td>
                <td className="px-4 py-3 text-right">{s._count.orders}</td>
                <td className="px-4 py-3 text-stone-600">{fmt(lastOrder.get(s.id))}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-stone-500">Nenhuma loja encontrada.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
