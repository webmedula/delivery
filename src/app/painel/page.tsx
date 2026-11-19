import Link from "next/link";
import type { Order, OrderItem } from "@prisma/client";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { orderStatusLabelsFor, paymentLabel, paymentStatusLabel } from "@/lib/order-status";
import type { BusinessType } from "@prisma/client";
import { boardColumns, OPEN_STATUSES, brDayStart, courierMessage, customerMessage, formatEta, minutesSince, nextStep } from "@/lib/delivery";
import { dismissTableCall, setTrackingCode, updateOrderStatus } from "./actions";
import { activeCall, CALL_TTL_MINUTES, callText, compareTableLabels } from "@/lib/tables";
import { orderStatusText } from "@/lib/niche";
import { formatDays } from "@/lib/shipping";
import { AutoRefresh } from "@/components/AutoRefresh";
import { NewOrderAlert } from "@/components/NewOrderAlert";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { courierUrl, storeUrl } from "@/lib/store-url";
import { CourierPicker } from "@/components/CourierPicker";
import { balanceDue, brDateOf, depositPaid, formatSchedule } from "@/lib/preorder";
import { toggleDepositPaid } from "./encomendas/actions";

export const dynamic = "force-dynamic";

type BoardOrder = Order & { items: OrderItem[] };

export default async function OrdersPage() {
  const { storeId, store } = await requireStoreUser();
  const startOfDay = brDayStart();

  const [open, today, awaiting, doneToday] = await Promise.all([
    db.order.findMany({
      where: { storeId, status: { in: OPEN_STATUSES }, paymentStatus: { not: "AWAITING" } },
      include: { items: true },
      // Encomendas: as de data mais próxima primeiro.
      orderBy: store.businessType === "PREORDER" ? [{ scheduledFor: "asc" }, { createdAt: "asc" }] : { createdAt: "asc" },
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
  // Mesas que chamaram o garçom ou pediram a conta (o chamado expira sozinho).
  const now = new Date();
  const calls = (
    await db.diningTable.findMany({
      where: { storeId, calledAt: { gte: new Date(now.getTime() - CALL_TTL_MINUTES * 60_000) } },
      select: { id: true, label: true, callKind: true, calledAt: true },
    })
  )
    .map((t) => ({ ...t, kind: activeCall(t, now) }))
    .filter((t) => t.kind)
    .sort((a, b) => a.calledAt!.getTime() - b.calledAt!.getTime() || compareTableLabels(a.label, b.label));

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
  // Entregadores ativos, mais quem já está em algum pedido aberto (mesmo pausado).
  const couriers = await db.courier.findMany({
    where: { storeId, OR: [{ active: true }, { id: { in: open.map((o) => o.courierId).filter((id): id is string => !!id) } }] },
    orderBy: { name: "asc" },
  });
  const courierLinks = new Map(await Promise.all(couriers.map(async (c) => [c.id, { url: await courierUrl(c.token), phone: c.phone, name: c.name }] as const)));
  // Chamado de mesa também toca o aviso (cada chamado novo conta como um item novo).
  const pendingIds = [
    ...open.filter((o) => o.status === "PENDING").map((o) => o.id),
    ...calls.map((c) => `mesa:${c.id}:${c.calledAt!.getTime()}`),
  ];

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

      {calls.length > 0 && (
        <div className="space-y-2">
          {calls.map((c) => (
            <form key={c.id} action={dismissTableCall} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-emerald-500 bg-emerald-50 px-4 py-3">
              <input type="hidden" name="id" value={c.id} />
              <span className="text-2xl" aria-hidden>{c.kind === "BILL" ? "🧾" : "🙋"}</span>
              <p className="flex-1 text-emerald-950">
                <strong className="text-lg">{c.label}</strong> {callText[c.kind!]}
                <span className="ml-2 text-sm text-emerald-800">há {minutesSince(c.calledAt!, now)} min</span>
              </p>
              {c.kind === "BILL" && <Link href={`/painel/mesas#mesa-${c.id}`} className="btn-ghost">Ver a conta</Link>}
              <button className="btn">Atendido</button>
            </form>
          ))}
        </div>
      )}

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
        {boardColumns(store.businessType).map((c) => (c.key === "out" && !store.acceptsDelivery ? { ...c, title: "Pronto" } : c)).map((col) => {
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
                    businessType={store.businessType}
                    trackingUrl={`${menuUrl}/pedido/${o.id}`}
                    couriers={couriers.map((c) => ({ id: c.id, name: c.name }))}
                    courier={o.courierId ? courierLinks.get(o.courierId) : undefined}
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

function OrderCard({ order: o, nth, now, storeName, storeAddress, businessType, trackingUrl, couriers, courier }: {
  order: BoardOrder; nth?: number; now: Date; storeName: string; storeAddress: string | null; businessType: BusinessType; trackingUrl: string;
  couriers: { id: string; name: string }[]; courier?: { url: string; phone: string; name: string };
}) {
  const step = nextStep(o.status, o.fulfillment, businessType);
  const orderStatusLabel = orderStatusLabelsFor(businessType);
  const age = minutesSince(o.createdAt, now);
  const scheduled = o.scheduledFor;
  // Envio tem outro ritmo: separar e postar em até 2 dias. Encomenda: atrasada só depois da hora marcada.
  const late = scheduled ? now > scheduled && o.status !== "READY_FOR_PICKUP" && o.status !== "OUT_FOR_DELIVERY" : o.fulfillment === "SHIPPING" ? age > 48 * 60 : o.etaMinutesMax ? age > o.etaMinutesMax : age > 60;
  const dueToday = !!scheduled && brDateOf(scheduled) === brDateOf(now);
  const signalPaid = depositPaid(o);
  const ageText = age >= 1440 ? `${Math.floor(age / 1440)} d` : age >= 120 ? `${Math.floor(age / 60)} h` : `${age} min`;
  const message = customerMessage(o, storeName, trackingUrl, storeAddress, businessType);

  return (
    <div className={`card space-y-3 ${o.status === "PENDING" ? "border-red-300 ring-2 ring-red-100" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold">#{o.number}</span>
        {o.fulfillment === "TABLE" ? (
          <span className="rounded-lg bg-emerald-600 px-2.5 py-1 text-sm font-bold text-white">{o.tableLabel ?? "Mesa"}</span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.fulfillment === "DELIVERY" ? "bg-sky-100 text-sky-800" : o.fulfillment === "SHIPPING" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"}`}>
            {o.fulfillment === "DELIVERY" ? "Entrega" : o.fulfillment === "SHIPPING" ? "Envio" : "Retirada"}
          </span>
        )}
        {scheduled ? (
          <span className={`ml-auto rounded-md px-2 py-0.5 text-xs font-semibold first-letter:uppercase ${late ? "bg-red-100 text-red-700" : dueToday ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-700"}`}>
            {formatSchedule(scheduled, now)}{late ? " · atrasada" : ""}
          </span>
        ) : (
          <span className={`ml-auto text-xs font-medium ${late ? "text-red-600" : "text-stone-500"}`} title={o.createdAt.toISOString()}>
            há {ageText}{late ? " · atrasado" : ""}
          </span>
        )}
      </div>
      <div className="text-sm">
        <p className="font-medium">
          {o.customerId ? <Link href={`/painel/clientes/${o.customerId}`} className="hover:underline">{o.customerName}</Link> : o.customerName}
          {o.customerPhone && <>{" · "}{formatPhone(o.customerPhone)}</>}
        </p>
        {nth !== undefined && (
          <p className="text-xs text-stone-500">{nth <= 1 ? "Primeiro pedido" : `${nth}º pedido na loja`}</p>
        )}
        {o.fulfillment === "DELIVERY" ? (
          <p className="text-stone-700">
            {o.deliveryZoneName && <strong>{o.deliveryZoneName}: </strong>}
            {o.address}
          </p>
        ) : o.fulfillment === "SHIPPING" ? (
          <div className="text-stone-700">
            <p><strong>{o.shippingMethodName ?? "Envio"}</strong> · frete {o.deliveryFeeCents ? formatBRL(o.deliveryFeeCents) : "grátis"}{formatDays(o.shippingDaysMin, o.shippingDaysMax) ? ` · ${formatDays(o.shippingDaysMin, o.shippingDaysMax)}` : ""}</p>
            <p className="select-all">{o.address}</p>
          </div>
        ) : o.fulfillment === "TABLE" ? (
          <p className="text-stone-600">Servir na <strong className="text-stone-900">{o.tableLabel ?? "mesa"}</strong></p>
        ) : (
          <p className="text-stone-600">Cliente vai retirar na loja</p>
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
              {o.paymentStatus === "PAID" ? "✓ " : ""}{o.depositCents && o.paymentStatus === "PAID" ? "Sinal pago online" : paymentStatusLabel[o.paymentStatus]}
            </span>
          )}
        </span>
        <span className="font-semibold">{formatBRL(o.totalCents)}</span>
      </div>
      {o.depositCents && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${signalPaid ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
          <span>
            {signalPaid ? "✓ Sinal pago" : "Sinal pendente"}: {formatBRL(o.depositCents)}
            <span className="block text-xs">Falta receber {formatBRL(balanceDue(o))} {o.fulfillment === "DELIVERY" ? "na entrega" : "na retirada"}</span>
          </span>
          {o.paymentStatus !== "PAID" && (
            <form action={toggleDepositPaid}>
              <input type="hidden" name="orderId" value={o.id} />
              <button className="rounded-md bg-white px-2 py-1 text-xs font-semibold ring-1 ring-current/20 hover:bg-white/70">
                {o.depositPaidAt ? "Desfazer" : "Marcar sinal recebido"}
              </button>
            </form>
          )}
        </div>
      )}
      {o.discountCents > 0 && (
        <p className="text-xs text-green-700">
          Desconto {o.loyaltyReward ? "de fidelidade" : `cupom ${o.couponCode}`}: −{formatBRL(o.discountCents)}
        </p>
      )}

      {o.fulfillment === "SHIPPING" && o.status === "OUT_FOR_DELIVERY" && (
        <form action={setTrackingCode} className="flex gap-2">
          <input type="hidden" name="orderId" value={o.id} />
          <input name="trackingCode" defaultValue={o.trackingCode ?? ""} placeholder="Código de rastreio" className="input font-mono uppercase" aria-label="Código de rastreio" />
          <button className="btn-ghost">Salvar</button>
        </form>
      )}
      {step && (
        <form action={updateOrderStatus} className="space-y-2">
          <input type="hidden" name="orderId" value={o.id} />
          <input type="hidden" name="status" value={step.status} />
          {o.fulfillment === "SHIPPING" && step.status === "OUT_FOR_DELIVERY" && (
            <input name="trackingCode" placeholder="Código de rastreio (ex.: QB123456789BR)" className="input font-mono uppercase" aria-label="Código de rastreio" />
          )}
          <button className="btn w-full py-2.5 text-base">{step.label} →</button>
        </form>
      )}
      {o.fulfillment === "DELIVERY" && o.status !== "PENDING" && couriers.length > 0 && (
        <div className="space-y-2 rounded-lg bg-sky-50 p-2">
          <CourierPicker key={o.courierId ?? ""} orderId={o.id} courierId={o.courierId} couriers={couriers} />
          {courier && (
            <a
              href={whatsappLink(courier.phone, courierMessage(o, courier.name, courier.url))}
              target="_blank"
              rel="noopener"
              className="block text-center text-sm font-medium text-sky-800 underline"
            >
              Mandar o pedido para {courier.name} no WhatsApp
            </a>
          )}
        </div>
      )}
      {o.fulfillment !== "TABLE" && o.customerPhone && <a
        href={whatsappLink(o.customerPhone, message)}
        target="_blank"
        rel="noopener"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-600/30 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-100"
      >
        Avisar cliente no WhatsApp: &quot;{orderStatusText(o.status, o.fulfillment, businessType)}&quot;
      </a>}
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
