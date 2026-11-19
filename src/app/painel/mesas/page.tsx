import Link from "next/link";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { siteUrl } from "@/lib/store-url";
import { qrSvg } from "@/lib/qr";
import { formatClock } from "@/lib/delivery";
import { activeCall, billSummary, callText, compareTableLabels, splitBill, tablePath } from "@/lib/tables";
import { AutoRefresh } from "@/components/AutoRefresh";
import { TablesForm } from "@/components/TablesForm";
import { closeTableBill, deleteTable, dismissTableCall, renameTable, resetTableCode, toggleTable } from "../actions";

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const { storeId, store } = await requireStoreUser();
  const tables = (await db.diningTable.findMany({ where: { storeId } })).sort(
    (a, b) => Number(b.active) - Number(a.active) || compareTableLabels(a.label, b.label),
  );
  const openOrders = await db.order.findMany({
    where: { storeId, tableId: { in: tables.map((t) => t.id) }, billClosedAt: null },
    select: {
      tableId: true, status: true, paymentStatus: true, totalCents: true, createdAt: true,
      items: { select: { name: true, quantity: true, unitPriceCents: true } },
    },
  });
  const base = await siteUrl();
  const now = new Date();
  const rows = await Promise.all(
    tables.map(async (t) => {
      const url = `${base}${tablePath(store.slug, t.code)}`;
      return { table: t, url, qr: await qrSvg(url), bill: billSummary(openOrders.filter((o) => o.tableId === t.id)), call: activeCall(t, now) };
    }),
  );
  const busy = rows.filter((r) => r.bill.orders > 0);
  const lastNumber = Math.max(0, ...tables.map((t) => Number(t.label.match(/(\d+)\s*$/)?.[1] ?? 0)));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <AutoRefresh seconds={15} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Mesas</h1>
        {tables.some((t) => t.active) && (
          <Link href="/imprimir/mesas" target="_blank" className="btn ml-auto">Imprimir QR codes das mesas</Link>
        )}
      </div>
      <p className="text-sm text-stone-600">
        Cada mesa tem um QR code. O cliente aponta a câmera do celular, vê o {store.businessType === "FOOD" ? "cardápio" : "catálogo"} e pede
        sem baixar nada e sem informar endereço. O pedido chega no quadro de Pedidos com o nome da mesa, e tudo o que a mesa pede vai
        somando na conta até você fechar. Pelo celular o cliente também chama o garçom e pede a conta.
      </p>

      {tables.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card py-3"><p className="text-sm text-stone-500">Mesas ocupadas</p><p className="text-2xl font-bold">{busy.length} <span className="text-base font-medium text-stone-400">de {tables.filter((t) => t.active).length}</span></p></div>
          <div className="card py-3"><p className="text-sm text-stone-500">Em contas abertas</p><p className="text-2xl font-bold">{formatBRL(busy.reduce((s, r) => s + r.bill.totalCents, 0))}</p></div>
          <div className="card py-3"><p className="text-sm text-stone-500">Chamando agora</p><p className="text-2xl font-bold">{rows.filter((r) => r.call).length}</p></div>
        </div>
      )}

      <TablesForm suggestFrom={lastNumber + 1} />

      {tables.length === 0 ? (
        <p className="card text-center text-sm text-stone-500">Nenhuma mesa ainda. Crie as mesas acima e imprima os QR codes.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map(({ table: t, url, qr, bill, call }) => (
            <li key={t.id} id={`mesa-${t.id}`} className={`card scroll-mt-4 space-y-3 p-4 ${!t.active ? "opacity-60" : call ? "border-emerald-500 ring-2 ring-emerald-100" : ""}`}>
              <div className="flex items-start gap-3">
                <a href={url} target="_blank" title="Abrir como o cliente vê" className="block h-20 w-20 flex-none rounded-lg ring-1 ring-stone-200 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold leading-tight">{t.label}</p>
                  {!t.active ? (
                    <p className="text-sm text-stone-500">Pausada: o QR mostra &quot;chame o garçom&quot;.</p>
                  ) : bill.orders > 0 ? (
                    <p className="text-sm text-stone-600">
                      <span className="mr-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Ocupada</span>
                      desde {formatClock(bill.openSince!)} · {bill.orders} {bill.orders === 1 ? "pedido" : "pedidos"}
                      {bill.waiting > 0 && <> · {bill.waiting} em andamento</>}
                    </p>
                  ) : (
                    <p className="text-sm text-stone-500"><span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">Livre</span></p>
                  )}
                  {bill.orders > 0 && <p className="mt-1 text-xl font-bold tabular-nums">{formatBRL(bill.totalCents)}</p>}
                </div>
              </div>

              {call && (
                <form action={dismissTableCall} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <input type="hidden" name="id" value={t.id} />
                  <span className="flex-1 font-medium">{call === "BILL" ? "🧾" : "🙋"} A mesa {callText[call]}</span>
                  <button className="font-semibold underline">Atendido</button>
                </form>
              )}

              {bill.orders > 0 && (
                <details className="rounded-lg bg-stone-50 p-3 text-sm" open={call === "BILL"}>
                  <summary className="cursor-pointer font-medium">Conta da mesa</summary>
                  <ul className="mt-2 space-y-1">
                    {bill.items.map((i) => (
                      <li key={i.name + i.totalCents} className="flex justify-between gap-2"><span>{i.quantity}× {i.name}</span><span className="tabular-nums">{formatBRL(i.totalCents)}</span></li>
                    ))}
                  </ul>
                  <div className="mt-2 space-y-1 border-t border-stone-200 pt-2">
                    <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatBRL(bill.totalCents)}</span></div>
                    {bill.paidCents > 0 && (
                      <>
                        <div className="flex justify-between text-green-700"><span>Já pago pelo celular</span><span className="tabular-nums">−{formatBRL(bill.paidCents)}</span></div>
                        <div className="flex justify-between font-semibold"><span>Falta pagar</span><span className="tabular-nums">{formatBRL(bill.dueCents)}</span></div>
                      </>
                    )}
                    {bill.dueCents > 0 && (
                      <p className="text-xs text-stone-500">
                        Dividir: {[2, 3, 4].map((n) => `${n} pessoas, ${formatBRL(splitBill(bill.dueCents, n)[0])} cada`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <form action={closeTableBill} className="mt-3">
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn w-full">Conta paga, liberar a mesa</button>
                  </form>
                </details>
              )}

              <div className="flex flex-wrap gap-2 text-sm">
                <Link href={`/imprimir/mesas?mesa=${t.id}`} target="_blank" className="btn-ghost">Imprimir QR</Link>
                <a href={url} target="_blank" className="btn-ghost">Abrir como cliente</a>
                <details className="w-full">
                  <summary className="cursor-pointer text-stone-500">Mais opções</summary>
                  <form action={renameTable} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <input name="label" defaultValue={t.label} className="input" aria-label="Nome da mesa" maxLength={40} />
                    <button className="btn-ghost">Renomear</button>
                  </form>
                  <p className="mt-2 break-all text-xs text-stone-500">Link: {url}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={toggleTable}><input type="hidden" name="id" value={t.id} /><button className="btn-ghost">{t.active ? "Pausar pedidos nesta mesa" : "Voltar a receber pedidos"}</button></form>
                    <form action={resetTableCode}><input type="hidden" name="id" value={t.id} /><button className="btn-ghost">Trocar o QR (o antigo para de funcionar)</button></form>
                    <form action={deleteTable}><input type="hidden" name="id" value={t.id} /><button className="px-3 py-2 text-red-600 hover:underline">Excluir mesa</button></form>
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
