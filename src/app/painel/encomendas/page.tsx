import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { modulesFor, orderStatusText } from "@/lib/niche";
import { onlineMethods } from "@/lib/payments";
import { brDayStart } from "@/lib/delivery";
import { balanceDue, brDateOf, brTimeOf, dayLabel, depositPaid, formatClosedDates, productionList } from "@/lib/preorder";
import { PreorderSettingsForm } from "@/components/PreorderSettingsForm";

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 14;

export default async function PreordersPage() {
  const { store, storeId } = await requireStoreUser();
  if (!modulesFor(store).preorder) redirect("/painel");
  const now = new Date();
  const today = brDayStart();
  const until = new Date(today.getTime() + DAYS_AHEAD * 24 * 60 * 60_000);

  const orders = await db.order.findMany({
    where: {
      storeId,
      status: { not: "CANCELED" },
      paymentStatus: { not: "AWAITING" },
      OR: [
        { scheduledFor: { gte: today, lt: until } },
        // Atrasadas: data já passou e a encomenda não foi concluída.
        { scheduledFor: { lt: today }, status: { notIn: ["COMPLETED", "CANCELED"] } },
      ],
    },
    include: { items: { select: { name: true, quantity: true } } },
    orderBy: { scheduledFor: "asc" },
  });

  const groups = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = o.scheduledFor! < today ? "late" : brDateOf(o.scheduledFor!);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Agenda de encomendas</h1>
          <p className="text-sm text-stone-500">Próximos {DAYS_AHEAD} dias, com o total a produzir em cada dia.</p>
        </div>
        <Link href="/painel" className="btn-ghost">Ver quadro de pedidos</Link>
      </div>

      {orders.length === 0 && (
        <div className="card text-center text-sm text-stone-500">Nenhuma encomenda marcada para os próximos dias.</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {[...groups.entries()].map(([key, list]) => {
          const pending = list.filter((o) => o.status !== "COMPLETED");
          const production = productionList(pending);
          const total = list.reduce((s, o) => s + o.totalCents, 0);
          return (
            <section key={key} className={`card space-y-3 ${key === "late" ? "border-red-300" : ""}`}>
              <header className="flex items-baseline justify-between gap-2">
                <h2 className={`text-lg font-bold first-letter:uppercase ${key === "late" ? "text-red-700" : ""}`}>
                  {key === "late" ? "Atrasadas" : dayLabel(key, now)}
                </h2>
                <span className="text-sm text-stone-500">{list.length} {list.length === 1 ? "encomenda" : "encomendas"} · {formatBRL(total)}</span>
              </header>
              {production.length > 0 && (
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-900">Para produzir</p>
                  <ul className="grid gap-x-4 text-sm text-amber-950 sm:grid-cols-2">
                    {production.map((p) => <li key={p.name}><strong className="tabular-nums">{p.quantity}×</strong> {p.name}</li>)}
                  </ul>
                </div>
              )}
              <ul className="divide-y divide-stone-100 text-sm">
                {list.map((o) => {
                  const due = balanceDue(o);
                  return (
                    <li key={o.id} className="flex items-start gap-3 py-2">
                      <span className="w-12 flex-none font-bold tabular-nums">{key === "late" ? brDateOf(o.scheduledFor!).slice(8, 10) + "/" + brDateOf(o.scheduledFor!).slice(5, 7) : brTimeOf(o.scheduledFor!)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          #{o.number} · {o.customerId ? <Link href={`/painel/clientes/${o.customerId}`} className="hover:underline">{o.customerName}</Link> : o.customerName}
                        </span>
                        <span className="block text-stone-500">
                          {o.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"} · {orderStatusText(o.status, o.fulfillment, store.businessType)}
                          {o.depositCents ? (depositPaid(o) ? " · sinal pago" : " · sinal pendente") : ""}
                        </span>
                      </span>
                      <span className="flex-none text-right tabular-nums">
                        {formatBRL(o.totalCents)}
                        {o.status !== "COMPLETED" && due > 0 && due !== o.totalCents && <span className="block text-xs text-stone-500">falta {formatBRL(due)}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <PreorderSettingsForm
        values={{
          minHours: store.preorderMinHours,
          maxDays: store.preorderMaxDays,
          weekdays: store.preorderWeekdays,
          times: store.preorderTimes.join(", "),
          dailyLimit: store.preorderDailyLimit ? String(store.preorderDailyLimit) : "",
          closedDates: formatClosedDates(store.preorderClosedDates),
          depositPercent: store.depositPercent,
          onlinePix: onlineMethods(store).pix,
        }}
      />
    </div>
  );
}
