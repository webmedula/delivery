import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { orderStatusLabel, paymentLabel } from "@/lib/order-status";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const order = await db.order.findFirst({ where: { id, store: { slug } }, include: { items: true, store: true } });
  if (!order) notFound();
  const { store } = order;

  const message = [
    `Olá! Acabei de fazer o pedido #${order.number} pelo cardápio.`,
    ...order.items.map((i) => `${i.quantity}x ${i.name}`),
    ...(order.discountCents > 0 ? [`Desconto: ${formatBRL(order.discountCents)}${order.couponCode ? ` (cupom ${order.couponCode})` : order.loyaltyReward ? " (fidelidade)" : ""}`] : []),
    `Total: ${formatBRL(order.totalCents)} (${paymentLabel[order.paymentMethod]})`,
    order.fulfillment === "DELIVERY" ? `Entrega: ${order.address}` : "Vou retirar no local.",
  ].join("\n");

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <AutoRefresh seconds={20} />
      <div className="card text-center">
        <p className="text-sm text-stone-500">{store.name}</p>
        <h1 className="text-2xl font-bold">Pedido #{order.number}</h1>
        <p className="mt-2 inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">{orderStatusLabel[order.status]}</p>
      </div>
      <div className="card space-y-2 text-sm">
        {order.items.map((i) => (
          <div key={i.id} className="flex justify-between"><span>{i.quantity}× {i.name}</span><span>{formatBRL(i.unitPriceCents * i.quantity)}</span></div>
        ))}
        <div className="flex justify-between border-t border-stone-100 pt-2"><span>Entrega</span><span>{formatBRL(order.deliveryFeeCents)}</span></div>
        {order.discountCents > 0 && (
          <div className="flex justify-between text-green-700">
            <span>{order.loyaltyReward ? "Recompensa de fidelidade" : `Cupom ${order.couponCode ?? ""}`}</span><span>−{formatBRL(order.discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold"><span>Total</span><span>{formatBRL(order.totalCents)}</span></div>
        <p className="text-stone-600">Pagamento: {paymentLabel[order.paymentMethod]}</p>
        {order.paymentMethod === "PIX" && store.pixKey && <p className="text-stone-600">Chave Pix da loja: <strong>{store.pixKey}</strong></p>}
      </div>
      {store.whatsapp && (
        <a className="btn w-full py-3" target="_blank" href={`https://wa.me/${store.whatsapp}?text=${encodeURIComponent(message)}`}>
          Avisar a loja no WhatsApp
        </a>
      )}
      <Link href={`/loja/${slug}`} className="btn-ghost w-full">Voltar ao cardápio</Link>
      <Link href={`/loja/${slug}/conta`} className="block text-center text-sm text-brand-700">Ver meus pedidos e selos</Link>
    </main>
  );
}
