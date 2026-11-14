import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { orderStatusLabel, paymentLabel } from "@/lib/order-status";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PixPayment } from "@/components/PixPayment";
import { getPixQrCode, syncOrderPayment } from "@/lib/payments";
import { cancelUnpaidOrder } from "../../actions";
import { getSessionCustomer } from "@/lib/customers";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  let order = await db.order.findFirst({ where: { id, store: { slug } }, include: { items: true, store: true } });
  if (!order) notFound();
  // Se o webhook ainda não chegou, pergunta ao Asaas se o cliente já pagou.
  if (order.paymentStatus === "AWAITING") {
    await syncOrderPayment(order);
    order = (await db.order.findFirst({ where: { id }, include: { items: true, store: true } }))!;
  }
  const { store } = order;
  const me = await getSessionCustomer(store.id);
  const suggestPin = !!me && me.id === order.customerId && !me.pinHash;
  const awaiting = order.paymentStatus === "AWAITING" && order.status !== "CANCELED";
  const pix = awaiting && order.paymentMethod === "ONLINE_PIX" ? await getPixQrCode(order) : null;

  const message = [
    `Olá! Acabei de fazer o pedido #${order.number} pelo cardápio.`,
    ...order.items.map((i) => `${i.quantity}x ${i.name}`),
    ...(order.discountCents > 0 ? [`Desconto: ${formatBRL(order.discountCents)}${order.couponCode ? ` (cupom ${order.couponCode})` : order.loyaltyReward ? " (fidelidade)" : ""}`] : []),
    `Total: ${formatBRL(order.totalCents)} (${paymentLabel[order.paymentMethod]}${order.paymentStatus === "PAID" ? ", já pago" : ""})`,
    order.fulfillment === "DELIVERY" ? `Entrega: ${order.address}` : "Vou retirar no local.",
  ].join("\n");

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <AutoRefresh seconds={awaiting ? 5 : 20} />
      <div className="card text-center">
        <p className="text-sm text-stone-500">{store.name}</p>
        <h1 className="text-2xl font-bold">Pedido #{order.number}</h1>
        <p className="mt-2 inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
          {awaiting ? "Aguardando pagamento" : orderStatusLabel[order.status]}
        </p>
        {order.paymentStatus === "PAID" && <p className="mt-2 text-sm font-medium text-green-700">✓ Pagamento confirmado</p>}
        {order.paymentStatus === "EXPIRED" && <p className="mt-2 text-sm text-stone-600">O pagamento não foi concluído e o pedido foi cancelado.</p>}
        {order.paymentStatus === "FAILED" && <p className="mt-2 text-sm text-stone-600">Não foi possível gerar o pagamento. Faça o pedido de novo com outra forma de pagamento.</p>}
      </div>
      {awaiting && (
        <div className="card space-y-3">
          <h2 className="text-center font-semibold">Pague {formatBRL(order.totalCents)} para enviar o pedido à loja</h2>
          {order.paymentMethod === "ONLINE_PIX" && pix && <PixPayment image={pix.encodedImage} payload={pix.payload} />}
          {order.paymentMethod === "ONLINE_PIX" && !pix && order.paymentUrl && (
            <a href={order.paymentUrl} target="_blank" className="btn w-full py-3">Abrir página de pagamento Pix</a>
          )}
          {order.paymentMethod === "ONLINE_CARD" && order.paymentUrl && (
            <a href={order.paymentUrl} className="btn w-full py-3">Pagar com cartão de crédito</a>
          )}
          <p className="text-center text-xs text-stone-500">Pagamento processado pelo Asaas e enviado direto para a loja. Esta página atualiza sozinha quando o pagamento for confirmado.</p>
          <form action={cancelUnpaidOrder} className="text-center">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="orderId" value={order.id} />
            <button className="text-sm text-stone-500 underline">Desistir e cancelar este pedido</button>
          </form>
        </div>
      )}
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
      {store.whatsapp && !awaiting && order.status !== "CANCELED" && (
        <a className="btn w-full py-3" target="_blank" href={`https://wa.me/${store.whatsapp}?text=${encodeURIComponent(message)}`}>
          Avisar a loja no WhatsApp
        </a>
      )}
      <Link href={`/loja/${slug}`} className="btn-ghost w-full">Voltar ao cardápio</Link>
      {suggestPin ? (
        <Link href={`/loja/${slug}/conta`} className="card block space-y-1 border-brand-100 bg-brand-50 text-sm text-brand-700">
          <strong className="block">Sua conta foi criada neste aparelho ✓</strong>
          Crie um PIN em &quot;Minha conta&quot; para acompanhar seus pedidos também em outro celular ou computador.
        </Link>
      ) : (
        <Link href={`/loja/${slug}/conta`} className="block text-center text-sm text-brand-700">Ver meus pedidos e selos</Link>
      )}
    </main>
  );
}
