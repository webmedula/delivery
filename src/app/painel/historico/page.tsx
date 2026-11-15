import Link from "next/link";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { orderStatusLabel, paymentLabel } from "@/lib/order-status";
import { brDate, brDayStart, courierSummary, formatClock } from "@/lib/delivery";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { storeId } = await requireStoreUser();
  const { dia } = await searchParams;
  const today = brDate(new Date());
  const day = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia <= today ? dia : today;
  const start = brDayStart(day);
  const end = new Date(start.getTime() + DAY);

  const orders = await db.order.findMany({
    where: { storeId, createdAt: { gte: start, lt: end }, status: { in: ["COMPLETED", "CANCELED"] } },
    include: { items: { select: { quantity: true } } },
    orderBy: { createdAt: "desc" },
  });

  const done = orders.filter((o) => o.status === "COMPLETED");
  const canceled = orders.length - done.length;
  const revenue = done.reduce((s, o) => s + o.totalCents, 0);
  const deliveries = done.filter((o) => o.fulfillment === "DELIVERY");
  const fees = deliveries.reduce((s, o) => s + o.deliveryFeeCents, 0);
  const cash = done.filter((o) => o.paymentMethod === "CASH").reduce((s, o) => s + o.totalCents, 0);
  const timed = deliveries.filter((o) => o.completedAt);
  const avgMinutes = timed.length
    ? Math.round(timed.reduce((s, o) => s + (o.completedAt!.getTime() - o.createdAt.getTime()), 0) / timed.length / 60_000)
    : null;

  const perCourier = courierSummary(done);
  const showCouriers = perCourier.some((r) => r.name !== "Sem entregador");

  const prev = brDate(new Date(start.getTime() - DAY / 2));
  const next = brDate(new Date(end.getTime() + DAY / 2));
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Histórico de pedidos</h1>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Link href={`/painel/historico?dia=${prev}`} className="btn-ghost">‹ Dia anterior</Link>
          <form className="flex gap-2">
            <input type="date" name="dia" defaultValue={day} max={today} className="input w-auto!" />
            <button className="btn-ghost">Ver</button>
          </form>
          {day < today && <Link href={`/painel/historico?dia=${next}`} className="btn-ghost">Próximo dia ›</Link>}
        </div>
      </div>
      <p className="text-stone-600 first-letter:uppercase">{day === today ? `Hoje, ${label}` : label}</p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="card"><p className="text-sm text-stone-500">Concluídos</p><p className="text-2xl font-bold">{done.length}</p>{canceled > 0 && <p className="text-xs text-stone-500">{canceled} cancelado(s)</p>}</div>
        <div className="card"><p className="text-sm text-stone-500">Faturamento</p><p className="text-2xl font-bold">{formatBRL(revenue)}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Entregas</p><p className="text-2xl font-bold">{deliveries.length}</p><p className="text-xs text-stone-500">{formatBRL(fees)} em taxas</p></div>
        <div className="card"><p className="text-sm text-stone-500">Recebido em dinheiro</p><p className="text-2xl font-bold">{formatBRL(cash)}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Tempo médio da entrega</p><p className="text-2xl font-bold">{avgMinutes !== null ? `${avgMinutes} min` : "—"}</p><p className="text-xs text-stone-500">do pedido até entregue</p></div>
      </div>

      {showCouriers && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Fechamento por entregador</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-stone-500">
                <tr>
                  <th className="py-1 pr-3">Entregador</th>
                  <th className="py-1 pr-3 text-right">Entregas</th>
                  <th className="py-1 pr-3 text-right">Taxas</th>
                  <th className="py-1 pr-3 text-right">Recebeu em dinheiro</th>
                  <th className="py-1 text-right">Recebeu no cartão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {perCourier.map((r) => (
                  <tr key={r.name}>
                    <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                    <td className="py-1.5 pr-3 text-right">{r.deliveries}</td>
                    <td className="py-1.5 pr-3 text-right">{formatBRL(r.feesCents)}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{formatBRL(r.cashCents)}</td>
                    <td className="py-1.5 text-right">{formatBRL(r.cardCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-500">&quot;Recebeu em dinheiro&quot; é o que o entregador deve devolver à loja no fim do dia.</p>
        </div>
      )}

      {orders.length === 0 ? (
        <p className="card text-center text-stone-500">Nenhum pedido concluído ou cancelado neste dia.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 text-left text-stone-500">
              <tr>
                <th className="px-3 py-2">Pedido</th>
                <th className="px-3 py-2">Hora</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Entrega</th>
                <th className="px-3 py-2">Entregador</th>
                <th className="px-3 py-2">Pagamento</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Levou</th>
                <th className="px-3 py-2">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {orders.map((o) => (
                <tr key={o.id} className={o.status === "CANCELED" ? "text-stone-400" : ""}>
                  <td className="px-3 py-2 font-semibold">#{o.number}</td>
                  <td className="px-3 py-2">{formatClock(o.createdAt)}</td>
                  <td className="px-3 py-2">
                    {o.customerId ? <Link href={`/painel/clientes/${o.customerId}`} className="hover:underline">{o.customerName}</Link> : o.customerName}
                    <span className="block text-xs text-stone-500">{formatPhone(o.customerPhone)}</span>
                  </td>
                  <td className="px-3 py-2">
                    {o.fulfillment === "DELIVERY" ? (o.deliveryZoneName ?? "Entrega") : "Retirada"}
                    {o.fulfillment === "DELIVERY" && o.deliveryFeeCents > 0 && <span className="block text-xs text-stone-500">taxa {formatBRL(o.deliveryFeeCents)}</span>}
                  </td>
                  <td className="px-3 py-2">{o.courierName ?? "—"}</td>
                  <td className="px-3 py-2">{paymentLabel[o.paymentMethod]}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatBRL(o.totalCents)}</td>
                  <td className="px-3 py-2">{o.completedAt ? `${Math.round((o.completedAt.getTime() - o.createdAt.getTime()) / 60_000)} min` : "—"}</td>
                  <td className="px-3 py-2">{orderStatusLabel[o.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
