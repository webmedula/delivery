import Link from "next/link";
import { requireStoreUser } from "@/lib/auth";
import { listCustomers, type CustomerSort } from "@/lib/customer-list";
import { formatBRL } from "@/lib/money";
import { formatPhone, whatsappLink } from "@/lib/phone";

export const dynamic = "force-dynamic";

const SORTS: { value: CustomerSort; label: string }[] = [
  { value: "recentes", label: "Compra mais recente" },
  { value: "gasto", label: "Quem mais gastou" },
  { value: "pedidos", label: "Mais pedidos" },
  { value: "nome", label: "Nome" },
];
const PAGE = 50;
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });

function daysAgo(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days === 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`;
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { store } = await requireStoreUser();
  const sp = await searchParams;
  const sort = (SORTS.find((s) => s.value === sp.ordem)?.value ?? "recentes") as CustomerSort;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const rows = await listCustomers(store, { q: sp.q, sort });
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const withOrders = rows.filter((r) => r.orders > 0);
  const optIn = rows.filter((r) => r.marketingOptIn).length;
  const revenue = withOrders.reduce((s, r) => s + r.totalCents, 0);
  const qs = (extra: Record<string, string | number>) =>
    "?" + new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ordem: sort, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) }).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <div className="flex flex-wrap gap-2">
          <a href={`/painel/clientes/exportar?promocoes=1`} className="btn-ghost">Exportar quem aceita promoções</a>
          <a href={`/painel/clientes/exportar${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ""}`} className="btn">Exportar CSV</a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card"><p className="text-sm text-stone-500">Clientes</p><p className="text-2xl font-bold">{rows.length}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Voltaram a pedir</p><p className="text-2xl font-bold">{rows.filter((r) => r.orders > 1).length}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Ticket médio por cliente</p><p className="text-2xl font-bold">{formatBRL(withOrders.length ? Math.round(revenue / withOrders.length) : 0)}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Aceitam promoções</p><p className="text-2xl font-bold">{optIn}</p></div>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Buscar por nome ou telefone" className="input max-w-xs" />
        <select name="ordem" defaultValue={sort} className="input max-w-56">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className="btn-ghost">Filtrar</button>
      </form>

      {rows.length === 0 ? (
        <p className="text-stone-500">{sp.q ? "Nenhum cliente encontrado." : "Os clientes aparecem aqui assim que fizerem o primeiro pedido pelo cardápio."}</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">WhatsApp</th>
                <th className="px-4 py-2 text-right font-medium">Pedidos</th>
                <th className="px-4 py-2 text-right font-medium">Total gasto</th>
                <th className="px-4 py-2 font-medium">Última compra</th>
                {store.loyaltyEnabled && <th className="px-4 py-2 font-medium">Selos</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {shown.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2">
                    <Link href={`/painel/clientes/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                    {r.marketingOptIn && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">promoções</span>}
                  </td>
                  <td className="px-4 py-2"><a href={whatsappLink(r.phone)} target="_blank" className="text-brand-700 hover:underline">{formatPhone(r.phone)}</a></td>
                  <td className="px-4 py-2 text-right">{r.orders}</td>
                  <td className="px-4 py-2 text-right">{formatBRL(r.totalCents)}</td>
                  <td className="px-4 py-2 text-stone-600">{r.lastOrderAt ? `${dateFmt.format(r.lastOrderAt)} (${daysAgo(r.lastOrderAt)})` : "—"}</td>
                  {store.loyaltyEnabled && (
                    <td className="px-4 py-2">{r.rewardAvailable ? <span className="text-brand-700">★ recompensa</span> : `${r.stamps}/${store.loyaltyOrdersRequired}`}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > PAGE && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={qs({ pagina: page - 1 })} className="btn-ghost">Anterior</Link>}
          <span>Página {page} de {Math.ceil(rows.length / PAGE)}</span>
          {page * PAGE < rows.length && <Link href={qs({ pagina: page + 1 })} className="btn-ghost">Próxima</Link>}
        </div>
      )}
    </div>
  );
}
