import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { orderStatusLabel } from "@/lib/order-status";
import { describeDiscount } from "@/lib/discounts";
import { getLoyaltyStatus, getSessionCustomer } from "@/lib/customers";
import { customerLogout, deleteCustomerAddress } from "../actions";
import { CustomerLoginForm, CustomerPinForm, CustomerProfileForm, ReorderButton } from "@/components/CustomerAccount";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha conta" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

export default async function AccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) notFound();
  const customer = await getSessionCustomer(store.id);

  const back = <Link href={`/loja/${slug}`} className="text-sm text-brand-700">← Voltar ao cardápio</Link>;

  if (!customer) {
    return (
      <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
        {back}
        <h1 className="text-2xl font-bold">Minha conta · {store.name}</h1>
        <div className="card space-y-2 text-sm text-stone-700">
          <p><strong>Primeira vez aqui?</strong> Não precisa de cadastro: faça seu pedido informando seu WhatsApp e sua conta é criada na hora, neste aparelho.</p>
          <p>Com a conta você guarda seus endereços, vê seus pedidos, pede de novo com um toque{store.loyaltyEnabled ? " e junta selos de fidelidade" : ""}.</p>
        </div>
        <CustomerLoginForm slug={slug} />
      </main>
    );
  }

  const [orders, addresses, loyalty, availableIds] = await Promise.all([
    db.order.findMany({ where: { customerId: customer.id }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.customerAddress.findMany({ where: { customerId: customer.id }, orderBy: { lastUsedAt: "desc" } }),
    getLoyaltyStatus(store, customer.id),
    db.product.findMany({ where: { storeId: store.id, available: true }, select: { id: true } }).then((r) => new Set(r.map((p) => p.id))),
  ]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      {back}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Olá, {customer.name.split(" ")[0]}!</h1>
          <p className="text-sm text-stone-500">{store.name} · {formatPhone(customer.phone)}</p>
        </div>
        <form action={customerLogout}>
          <input type="hidden" name="slug" value={slug} />
          <button className="btn-ghost px-3 py-1.5">Sair</button>
        </form>
      </div>

      {loyalty && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Cartão fidelidade</h2>
            <span className="text-sm text-stone-500">{loyalty.stamps} de {loyalty.ordersRequired}</span>
          </div>
          <div className="flex flex-wrap gap-2" aria-label={`${loyalty.stamps} de ${loyalty.ordersRequired} selos`}>
            {Array.from({ length: loyalty.ordersRequired }, (_, i) => (
              <span
                key={i}
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-lg ${i < loyalty.stamps ? "border-brand-600 bg-brand-600 text-white" : "border-dashed border-stone-300 text-stone-300"}`}
              >
                ★
              </span>
            ))}
          </div>
          <p className="text-sm text-stone-700">
            {loyalty.rewardAvailable
              ? <>Parabéns! Você ganhou <strong>{describeDiscount({ type: store.loyaltyRewardType, value: store.loyaltyRewardValue })}</strong>. É só marcar na sacola do próximo pedido.</>
              : <>A cada {loyalty.ordersRequired} pedidos concluídos{store.loyaltyMinOrderCents > 0 ? ` (a partir de ${formatBRL(store.loyaltyMinOrderCents)})` : ""}, você ganha {describeDiscount({ type: store.loyaltyRewardType, value: store.loyaltyRewardValue })}.</>}
          </p>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Meus pedidos</h2>
        {orders.length === 0 && <p className="text-sm text-stone-500">Você ainda não fez pedidos.</p>}
        <ul className="divide-y divide-stone-100">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-3">
              <Link href={`/loja/${slug}/pedido/${o.id}`} className="min-w-0 flex-1">
                <p className="text-sm font-medium">#{o.number} · {dateFmt.format(o.createdAt)} · {formatBRL(o.totalCents)}</p>
                <p className="truncate text-sm text-stone-500">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                <p className="text-xs text-stone-500">{orderStatusLabel[o.status]}</p>
              </Link>
              <ReorderButton
                slug={slug}
                items={o.items.filter((i) => i.productId && availableIds.has(i.productId)).map((i) => ({ productId: i.productId!, quantity: i.quantity }))}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Endereços salvos</h2>
        {addresses.length === 0 && <p className="text-sm text-stone-500">Os endereços das suas entregas aparecem aqui.</p>}
        <ul className="space-y-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
              <span>{a.address}</span>
              <form action={deleteCustomerAddress}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={a.id} />
                <button className="text-red-600 hover:underline">Remover</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Meus dados</h2>
        <CustomerProfileForm slug={slug} name={customer.name} marketingOptIn={customer.marketingOptIn} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Acesso em outro aparelho</h2>
        <CustomerPinForm slug={slug} hasPin={!!customer.pinHash} />
      </section>
    </main>
  );
}
