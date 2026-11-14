import Link from "next/link";
import type { Order, OrderItem } from "@prisma/client";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { orderStatusLabel, paymentLabel, paymentStatusLabel } from "@/lib/order-status";
import { BOARD_COLUMNS, OPEN_STATUSES, brDayStart, customerMessage, formatEta, minutesSince, nextStep } from "@/lib/delivery";
import { updateOrderStatus } from "./actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { NewOrderAlert } from "@/components/NewOrderAlert";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { storeUrl } from "@/lib/store-url";

export const dynamic = "force-dynamic";

type BoardOrder = Order & { items: OrderItem[] };

export default async function OrdersPage() {
  const { storeId, store } = await requireStoreUser();
  const startOfDay = brDayStart();

  const [open, today, awaiting, doneToday] = await Promise.all([
    db.order.findMany({
      where: { storeId, status: { in: OPEN_STATUSES }, paymentStatus: { not: "AWAITING" } },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    db.order.aggregate({
      where: { storeId, createdAt: { gte: startOfDay }, status: { not: "CANCELED" }, paymentStatus: { not: "AWAITING" } },
      _count: true,
      _sum: { totalCents: true },
    }),
    // Pedidos pagos online que o cliente ainda não pagou: não preparar ainda.
    db.order.findMany({
      where: { storeId, status: { not: "CANCELED" }, paymentStatus: "AWAITING" },
      select: { id: true, number: true, customerName: true, totalCents: true, paymentMethod: true },
      orderBy: { createdAt: "asc" },
    }),
    db.order.count({ where: { storeId, status: "COMPLETED", completedAt: { gte: startOfDay } } }),
  ]);

  // Quantos pedidos o cliente já fez até este (inclusive), para mostrar "Primeiro pedido" / "5º pedido".
  const nth = new Map(
    await Promise.all(
      open.filter((o) => o.customerId).map(async (o) => [
        o.id,
        await db.order.count({ where: { storeId, customerId: o.customerId, createdAt: { lte: o.createdAt }, status: { not: "CANCELED" } } }),
      ] as const),
    ),
  );
  const menuUrl = await storeUrl(store.slug);
  const now = new Date();
  const pendingIds = open.filter((o) => o.status === "PENDING").map((o) => o.id);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <div className="card"><p className="text-sm text-stone-500">Pedidos hoje</p><p className="text-2xl font-bold">{today._count}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Faturamento hoje</p><p className="text-2xl font-bold">{formatBRL(today._sum.totalCents ?? 0)}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Em andamento</p><p className="text-2xl font-bold">{open.length}</p></div>
        <Link href="/painel/historico" className="card block hover:border-brand-300">
          <p className="text-sm text-stone-500">Concluídos hoje</p>
          <p className="text-2xl font-bold">{doneToday} <span className="text-sm font-medium text-brand-700">ver histórico ›</span></p>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Pedidos em andamento</h1>
        <NewOrderAlert pendingIds={pendingIds} />
      </div>

      {awaiting.length > 0 && (
        <div className="card text-sm">
          <p className="font-medium">Aguardando pagamento online ({awaiting.length})</p>
          <p className="text-stone-500">Ainda não prepare. O pedido entra em &quot;Novos&quot; assim que o pagamento for confirmado.</p>
          <ul className="mt-2 space-y-1 text-stone-700">
            {awaiting.map((o) => (
              <li key={o.id}>#{o.number} · {o.customerName} · {formatBRL(o.totalCents)} · {paymentLabel[o.paymentMethod]}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {BOARD_COLUMNS.map((col) => {
          const orders = open.filter((o) => (col.statuses as readonly string[]).includes(o.status));
          return (
            <section key={col.key} className="rounded-2xl bg-stone-100 p-3">
              <h2 className="mb-3 flex items-center justify-between px-1 font-semibold">
                {col.title}
                <span className={`rounded-full px-2 py-0.5 text-sm ${col.key === "new" && orders.length > 0 ? "bg-red-600 text-white" : "bg-white text-stone-600"}`}>
                  {orders.length}
                </span>
              </h2>
              <div className="space-y-3">
                {orders.length === 0 && (
                  <p className="px-1 py-6 text-center text-sm text-stone-500">
                    {col.key === "new" ? "Nenhum pedido novo. A tela atualiza sozinha." : "Nada aqui."}
                  </p>
                )}
                {orders.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    nth={nth.get(o.id)}
                    now={now}
                    storeName={store.name}
                    storeAddress={store.address}
                    trackingUrl={`${menuUrl}/pedido/${o.id}`}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({ order: o, nth, now, storeName, storeAddress, trackingUrl }: {
  order: BoardOrder; nth?: number; now: Date; storeName: string; storeAddress: string | null; trackingUrl: string;
}) {
  const step = nextStep(o.status, o.fulfillment);
  const age = minutesSince(o.createdAt, now);
  const late = o.etaMinutesMax ? age > o.etaMinutesMax : age > 60;
  const message = customerMessage(o, storeName, trackingUrl, storeAddress);

  return (
    <div className={`card space-y-3 ${o.status === "PENDING" ? "border-red-300 ring-2 ring-red-100" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold">#{o.number}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.fulfillment === "DELIVERY" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>
          {o.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"}
        </span>
        <span className={`ml-auto text-xs font-medium ${late ? "text-red-600" : "text-stone-500"}`} title={o.createdAt.toISOString()}>
          há {age} min{late ? " · atrasado" : ""}
        </span>
      </div>
      <div className="text-sm">
        <p className="font-medium">
          {o.customerId ? <Link href={`/painel/clientes/${o.customerId}`} className="hover:underline">{o.customerName}</Link> : o.customerName}
          {" · "}{formatPhone(o.customerPhone)}
        </p>
        {nth !== undefined && (
          <p className="text-xs text-stone-500">{nth <= 1 ? "Primeiro pedido" : `${nth}º pedido na loja`}</p>
        )}
        {o.fulfillment === "DELIVERY" ? (
          <p className="text-stone-700">
            {o.deliveryZoneName && <strong>{o.deliveryZoneName}: </strong>}
            {o.address}
          </p>
        ) : (
          <p className="text-stone-600">Cliente vai retirar no local</p>
        )}
        {o.etaMinutesMin && o.status !== "OUT_FOR_DELIVERY" && o.status !== "READY_FOR_PICKUP" && (
          <p className="text-xs text-stone-500">Prometido ao cliente: entre {formatEta(o.createdAt, o.etaMinutesMin, o.etaMinutesMax)}</p>
        )}
      </div>
      <ul className="border-t border-stone-100 pt-2 text-sm">
        {o.items.map((i) => (
          <li key={i.id}><strong>{i.quantity}×</strong> {i.name}{i.notes ? <span className="text-stone-500"> ({i.notes})</span> : null}</li>
        ))}
      </ul>
      {o.notes && <p className="rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-900">Obs.: {o.notes}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-stone-600">
          {paymentLabel[o.paymentMethod]}
          {o.changeForCents ? ` · troco p/ ${formatBRL(o.changeForCents)}` : ""}
          {o.paymentStatus !== "NONE" && (
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${o.paymentStatus === "PAID" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
              {o.paymentStatus === "PAID" ? "✓ " : ""}{paymentStatusLabel[o.paymentStatus]}
            </span>
          )}
        </span>
        <span className="font-semibold">{formatBRL(o.totalCents)}</span>
      </div>
      {o.discountCents > 0 && (
        <p className="text-xs text-green-700">
          Desconto {o.loyaltyReward ? "de fidelidade" : `cupom ${o.couponCode}`}: −{formatBRL(o.discountCents)}
        </p>
      )}

      {step && (
        <form action={updateOrderStatus}>
          <input type="hidden" name="orderId" value={o.id} />
          <input type="hidden" name="status" value={step.status} />
          <button className="btn w-full py-2.5 text-base">{step.label} →</button>
        </form>
      )}
      <a
        href={whatsappLink(o.customerPhone, message)}
        target="_blank"
        rel="noopener"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-600/30 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-100"
      >
        Avisar cliente no WhatsApp: &quot;{orderStatusLabel[o.status]}&quot;
      </a>
      <details className="text-sm">
        <summary className="cursor-pointer text-stone-500">Mais opções</summary>
        <form action={updateOrderStatus} className="mt-2 flex gap-2">
          <input type="hidden" name="orderId" value={o.id} />
          <select name="status" defaultValue={o.status} className="input">
            {Object.entries(orderStatusLabel).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="btn-ghost">Mudar</button>
        </form>
        <a href={trackingUrl} target="_blank" className="mt-2 inline-block text-brand-700 underline">Ver como o cliente vê</a>
        {o.paymentStatus === "PAID" && (
          <p className="mt-2 text-xs text-stone-500">Pago online. Se precisar cancelar, faça o estorno no app do Asaas.</p>
        )}
      </details>
    </div>
  );
}
