import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { amountToCollect, brDayStart, courierNextStep, courierSummary, formatClock, googleMapsLink, wazeLink } from "@/lib/delivery";
import { AutoRefresh } from "@/components/AutoRefresh";
import { NewOrderAlert } from "@/components/NewOrderAlert";
import { courierAdvance } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minhas entregas", robots: { index: false, follow: false } };

export default async function CourierPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const courier = await db.courier.findUnique({ where: { token }, include: { store: true } });
  if (!courier) notFound();
  const { store } = courier;

  if (!courier.active) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-semibold">{store.name}</p>
        <p className="mt-2 text-stone-600">Seu acesso de entregador está pausado. Fale com a loja.</p>
      </main>
    );
  }

  const [orders, done] = await Promise.all([
    db.order.findMany({
      where: { courierId: courier.id, storeId: store.id, status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"] } },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    db.order.findMany({
      where: { courierId: courier.id, storeId: store.id, status: "COMPLETED", completedAt: { gte: brDayStart() } },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  const onRoute = orders.filter((o) => o.status === "OUT_FOR_DELIVERY");
  const waiting = orders.filter((o) => o.status !== "OUT_FOR_DELIVERY");
  const today = courierSummary(done)[0];

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <AutoRefresh seconds={15} />
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{store.name}</p>
          <h1 className="text-2xl font-bold">Olá, {courier.name.split(" ")[0]}</h1>
        </div>
        <NewOrderAlert pendingIds={waiting.map((o) => o.id)} />
      </header>

      <Section title="Em rota" count={onRoute.length} empty="Nenhuma entrega em rota agora.">
        {onRoute.map((o) => <DeliveryCard key={o.id} order={o} token={token} />)}
      </Section>

      <Section title="Para pegar na loja" count={waiting.length} empty="Quando a loja passar um pedido para você, ele aparece aqui. A página atualiza sozinha.">
        {waiting.map((o) => <DeliveryCard key={o.id} order={o} token={token} />)}
      </Section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Hoje</h2>
        {today ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-2xl font-bold">{today.deliveries}</p><p className="text-xs text-stone-500">entregas</p></div>
              <div><p className="text-lg font-bold">{formatBRL(today.cashCents)}</p><p className="text-xs text-stone-500">em dinheiro</p></div>
              <div><p className="text-lg font-bold">{formatBRL(today.feesCents)}</p><p className="text-xs text-stone-500">em taxas</p></div>
            </div>
            {today.cashCents > 0 && <p className="text-sm text-stone-600">Lembre de acertar com a loja o dinheiro recebido.</p>}
            <ul className="divide-y divide-stone-100 text-sm">
              {done.map((o) => (
                <li key={o.id} className="flex justify-between py-1.5">
                  <span>#{o.number} · {o.deliveryZoneName ?? o.customerName}</span>
                  <span className="text-stone-500">{o.completedAt ? formatClock(o.completedAt) : ""}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma entrega concluída hoje.</p>
        )}
      </section>
      <p className="text-center text-xs text-stone-400">Este link é só seu. Não compartilhe.</p>
    </main>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {title}
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-sm">{count}</span>
      </h2>
      {count === 0 ? <p className="card text-center text-sm text-stone-500">{empty}</p> : children}
    </section>
  );
}

type CardOrder = Awaited<ReturnType<typeof db.order.findMany<{ include: { items: true } }>>>[number];

function DeliveryCard({ order: o, token }: { order: CardOrder; token: string }) {
  const step = courierNextStep(o.status);
  const collect = amountToCollect(o);
  const address = o.address ?? "";
  return (
    <div className={`card space-y-3 ${o.status === "OUT_FOR_DELIVERY" ? "border-brand-300" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xl font-bold">#{o.number}</span>
        <span className="text-sm text-stone-500">
          {o.status === "OUT_FOR_DELIVERY" ? `saiu às ${o.dispatchedAt ? formatClock(o.dispatchedAt) : ""}` : "sendo preparado"}
        </span>
      </div>
      <div>
        {o.deliveryZoneName && <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{o.deliveryZoneName}</p>}
        <p className="text-lg leading-snug">{address}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a href={googleMapsLink(address, o.deliveryZoneName)} target="_blank" rel="noopener" className="btn-ghost justify-center">Google Maps</a>
        <a href={wazeLink(address, o.deliveryZoneName)} target="_blank" rel="noopener" className="btn-ghost justify-center">Waze</a>
      </div>
      <div className={`rounded-lg px-3 py-2 text-sm font-medium ${collect.cents > 0 ? "bg-amber-100 text-amber-900" : "bg-green-50 text-green-800"}`}>
        {collect.text}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{o.customerName}</span>
        <span className="text-stone-500">{formatPhone(o.customerPhone)}</span>
        <span className="ml-auto flex gap-2">
          <a href={`tel:+55${o.customerPhone}`} className="btn-ghost px-3 py-1.5">Ligar</a>
          <a href={whatsappLink(o.customerPhone, `Olá, ${o.customerName.split(" ")[0]}! Sou o entregador do pedido #${o.number}.`)} target="_blank" rel="noopener" className="btn-ghost px-3 py-1.5">WhatsApp</a>
        </span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-stone-500">{o.items.reduce((s, i) => s + i.quantity, 0)} item(ns){o.notes ? " · tem observação" : ""}</summary>
        <ul className="mt-1">{o.items.map((i) => <li key={i.id}>{i.quantity}× {i.name}</li>)}</ul>
        {o.notes && <p className="mt-1 text-amber-900">Obs.: {o.notes}</p>}
      </details>
      {step && (
        <form action={courierAdvance}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="orderId" value={o.id} />
          <input type="hidden" name="status" value={step.status} />
          <button className="btn w-full py-3 text-lg">{step.label}</button>
        </form>
      )}
    </div>
  );
}
