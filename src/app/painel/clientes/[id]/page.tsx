import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { orderStatusLabel } from "@/lib/order-status";
import { getLoyaltyStatus } from "@/lib/customers";

export const dynamic = "force-dynamic";
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { store, storeId } = await requireStoreUser();
  const customer = await db.customer.findFirst({
    where: { id: (await params).id, storeId },
    include: { addresses: { orderBy: { lastUsedAt: "desc" } }, orders: { include: { items: true }, orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!customer) notFound();
  const loyalty = await getLoyaltyStatus(store, customer.id);
  const valid = customer.orders.filter((o) => o.status !== "CANCELED");
  const total = valid.reduce((s, o) => s + o.totalCents, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/painel/clientes" className="text-sm text-brand-700">← Clientes</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-stone-500">
            {formatPhone(customer.phone)} · cliente desde {customer.createdAt.toLocaleDateString("pt-BR")}
            {customer.marketingOptIn ? " · aceita promoções" : ""}
          </p>
        </div>
        <a href={whatsappLink(customer.phone, `Olá, ${customer.name.split(" ")[0]}! Aqui é da ${store.name}.`)} target="_blank" className="btn">Chamar no WhatsApp</a>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-stone-500">Pedidos</p><p className="text-2xl font-bold">{valid.length}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Total gasto</p><p className="text-2xl font-bold">{formatBRL(total)}</p></div>
        <div className="card">
          <p className="text-sm text-stone-500">{loyalty ? "Fidelidade" : "Ticket médio"}</p>
          <p className="text-2xl font-bold">
            {loyalty ? (loyalty.rewardAvailable ? "★ Ganhou" : `${loyalty.stamps}/${loyalty.ordersRequired}`) : formatBRL(valid.length ? Math.round(total / valid.length) : 0)}
          </p>
        </div>
      </div>
      {customer.addresses.length > 0 && (
        <div className="card space-y-1 text-sm">
          <h2 className="mb-2 font-semibold">Endereços</h2>
          {customer.addresses.map((a) => <p key={a.id}>{a.address}</p>)}
        </div>
      )}
      <div className="card p-0">
        <h2 className="px-5 pt-4 font-semibold">Pedidos</h2>
        <ul className="divide-y divide-stone-100">
          {customer.orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
              <div>
                <p className="font-medium">#{o.number} · {dateFmt.format(o.createdAt)} · {orderStatusLabel[o.status]}</p>
                <p className="text-stone-500">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                {o.discountCents > 0 && <p className="text-green-700">−{formatBRL(o.discountCents)} {o.loyaltyReward ? "(fidelidade)" : `(cupom ${o.couponCode})`}</p>}
              </div>
              <span className="font-semibold">{formatBRL(o.totalCents)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
