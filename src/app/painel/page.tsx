import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { orderStatusLabel, paymentLabel } from "@/lib/order-status";
import { updateOrderStatus } from "./actions";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const OPEN = ["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"] as const;

export default async function OrdersPage() {
  const { storeId } = await requireStoreUser();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [open, today] = await Promise.all([
    db.order.findMany({
      where: { storeId, status: { in: [...OPEN] } },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    db.order.aggregate({
      where: { storeId, createdAt: { gte: startOfDay }, status: { not: "CANCELED" } },
      _count: true,
      _sum: { totalCents: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={15} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-stone-500">Pedidos hoje</p><p className="text-2xl font-bold">{today._count}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Faturamento hoje</p><p className="text-2xl font-bold">{formatBRL(today._sum.totalCents ?? 0)}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Em aberto</p><p className="text-2xl font-bold">{open.length}</p></div>
      </div>

      <h1 className="text-xl font-semibold">Pedidos em aberto</h1>
      {open.length === 0 && <p className="text-stone-500">Nenhum pedido em aberto. Esta tela atualiza sozinha.</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {open.map((o) => (
          <div key={o.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold">#{o.number}</span>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">{orderStatusLabel[o.status]}</span>
            </div>
            <div className="text-sm">
              <p className="font-medium">{o.customerName} · {o.customerPhone}</p>
              <p className="text-stone-600">{o.fulfillment === "DELIVERY" ? `Entrega: ${o.address}` : "Retirada no local"}</p>
              <p className="text-stone-600">
                {paymentLabel[o.paymentMethod]}
                {o.changeForCents ? ` (troco para ${formatBRL(o.changeForCents)})` : ""}
              </p>
            </div>
            <ul className="border-t border-stone-100 pt-2 text-sm">
              {o.items.map((i) => (
                <li key={i.id}>{i.quantity}× {i.name}{i.notes ? <span className="text-stone-500"> ({i.notes})</span> : null}</li>
              ))}
            </ul>
            {o.notes && <p className="text-sm text-stone-600">Obs.: {o.notes}</p>}
            <p className="font-semibold">{formatBRL(o.totalCents)}</p>
            <form action={updateOrderStatus} className="flex gap-2">
              <input type="hidden" name="orderId" value={o.id} />
              <select name="status" defaultValue={o.status} className="input">
                {Object.entries(orderStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button className="btn">Salvar</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
