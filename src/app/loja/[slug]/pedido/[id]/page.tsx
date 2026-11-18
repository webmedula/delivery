import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { paymentLabel } from "@/lib/order-status";
import { orderSummaryMessage, storeWhatsappLink } from "@/lib/order-message";
import { orderStatusText, termsFor } from "@/lib/niche";
import { CORREIOS_TRACKING_URL, formatDays, isCorreiosCode } from "@/lib/shipping";
import { storeUrl } from "@/lib/store-url";
import { AutoRefresh } from "@/components/AutoRefresh";
import { OpenWhatsapp } from "@/components/OpenWhatsapp";
import { InstallInvite } from "@/components/InstallApp";
import { PixPayment } from "@/components/PixPayment";
import { getPixQrCode, syncOrderPayment } from "@/lib/payments";
import { cancelUnpaidOrder } from "../../actions";
import { getSessionCustomer } from "@/lib/customers";
import { currentStepIndex, formatClock, formatEta, trackingSteps } from "@/lib/delivery";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ enviar?: string }> }) {
  const { slug, id } = await params;
  const sendNow = (await searchParams).enviar === "1";
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
  const terms = termsFor(store.businessType);
  const combine = order.paymentMethod === "WHATSAPP";
  const steps = trackingSteps(order.fulfillment, store.businessType);
  const stepIndex = currentStepIndex(order.status, order.fulfillment);
  const stepTimes = [order.createdAt, order.acceptedAt, order.dispatchedAt, order.completedAt];
  const showEta = !!order.etaMinutesMin && !awaiting && stepIndex >= 0 && stepIndex < 2;
  const pix = awaiting && order.paymentMethod === "ONLINE_PIX" ? await getPixQrCode(order) : null;

  const message = orderSummaryMessage(order, {
    catalogWord: terms.catalogLower,
    trackingUrl: combine ? `${await storeUrl(slug)}/pedido/${order.id}` : undefined,
  });

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <AutoRefresh seconds={awaiting ? 5 : 20} />
      {sendNow && combine && store.whatsapp && !store.isDemo && order.status === "PENDING" && <OpenWhatsapp url={storeWhatsappLink(store.whatsapp, message)} />}
      <div className="card text-center">
        <p className="text-sm text-stone-500">{store.name}</p>
        <h1 className="text-2xl font-bold">Pedido #{order.number}</h1>
        <p className="mt-2 inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
          {awaiting ? "Aguardando pagamento" : orderStatusText(order.status, order.fulfillment, store.businessType)}
        </p>
        {showEta && (
          <p className="mt-3 text-sm text-stone-700">
            {order.fulfillment === "DELIVERY" ? "Previsão de entrega" : "Fica pronto"} entre{" "}
            <strong className="text-base text-stone-900">{formatEta(order.createdAt, order.etaMinutesMin!, order.etaMinutesMax)}</strong>
          </p>
        )}
        {order.fulfillment === "SHIPPING" && order.status === "OUT_FOR_DELIVERY" && (
          <div className="mt-3 space-y-2 text-sm text-stone-700">
            <p>
              Seu pedido foi enviado{order.shippingMethodName ? <> por <strong>{order.shippingMethodName}</strong></> : ""}.
              {formatDays(order.shippingDaysMin, order.shippingDaysMax) && <> Prazo: {formatDays(order.shippingDaysMin, order.shippingDaysMax)}.</>}
            </p>
            {order.trackingCode && (
              <div className="rounded-xl bg-stone-50 p-3">
                <p className="text-xs text-stone-500">Código de rastreio</p>
                <p className="select-all font-mono text-lg font-semibold tracking-wider">{order.trackingCode}</p>
                {isCorreiosCode(order.trackingCode) && (
                  <a href={CORREIOS_TRACKING_URL} target="_blank" rel="noopener" className="mt-1 inline-block text-brand-700 underline">Rastrear no site dos Correios</a>
                )}
              </div>
            )}
          </div>
        )}
        {order.fulfillment === "SHIPPING" && (order.status === "PENDING" || order.status === "CONFIRMED" || order.status === "PREPARING") && !awaiting && (
          <p className="mt-3 text-sm text-stone-700">
            A loja vai separar e postar seu pedido{order.shippingMethodName ? <> por <strong>{order.shippingMethodName}</strong></> : ""}. Você recebe o código de rastreio quando ele for enviado.
          </p>
        )}
        {order.fulfillment !== "SHIPPING" && order.status === "OUT_FOR_DELIVERY" && <p className="mt-3 text-sm text-stone-700">Seu pedido está a caminho{order.courierName ? <> com <strong>{order.courierName.trim().split(/\s+/)[0]}</strong></> : ""}. Fique de olho no telefone!</p>}
        {order.status === "READY_FOR_PICKUP" && (
          <p className="mt-3 text-sm text-stone-700">Pode vir buscar{store.address ? <> em <strong>{store.address}</strong></> : ""}.</p>
        )}
        {order.paymentStatus === "PAID" && <p className="mt-2 text-sm font-medium text-green-700">✓ Pagamento confirmado</p>}
        {order.paymentStatus === "EXPIRED" && <p className="mt-2 text-sm text-stone-600">O pagamento não foi concluído e o pedido foi cancelado.</p>}
        {order.paymentStatus === "FAILED" && <p className="mt-2 text-sm text-stone-600">Não foi possível gerar o pagamento. Faça o pedido de novo com outra forma de pagamento.</p>}
      </div>
      {!awaiting && stepIndex >= 0 && (
        <ol className="card space-y-0">
          {steps.map((step, i) => {
            const done = i <= stepIndex;
            const at = done ? stepTimes[i] : null;
            return (
              <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0">
                {i < steps.length - 1 && (
                  <span className={`absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 ${i < stepIndex ? "bg-brand-500" : "bg-stone-200"}`} aria-hidden />
                )}
                <span
                  className={`relative z-[1] flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
                    done ? "bg-brand-600 text-white" : "bg-stone-200 text-stone-500"
                  } ${i === stepIndex && i < steps.length - 1 ? "ring-4 ring-brand-100" : ""}`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={`flex-1 text-sm ${done ? "font-semibold text-stone-900" : "text-stone-500"}`}>{step.label}</span>
                {at && <span className="text-xs text-stone-500">{formatClock(at)}</span>}
              </li>
            );
          })}
        </ol>
      )}
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
        {order.fulfillment === "DELIVERY" ? (
          <div className="flex justify-between border-t border-stone-100 pt-2">
            <span>Entrega{order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ""}</span><span>{formatBRL(order.deliveryFeeCents)}</span>
          </div>
        ) : order.fulfillment === "SHIPPING" ? (
          <div className="flex justify-between border-t border-stone-100 pt-2">
            <span>Frete{order.shippingMethodName ? ` (${order.shippingMethodName})` : ""}</span><span>{order.deliveryFeeCents ? formatBRL(order.deliveryFeeCents) : "grátis"}</span>
          </div>
        ) : (
          <div className="flex justify-between border-t border-stone-100 pt-2"><span>Retirada no local</span><span>grátis</span></div>
        )}
        {order.discountCents > 0 && (
          <div className="flex justify-between text-green-700">
            <span>{order.loyaltyReward ? "Recompensa de fidelidade" : `Cupom ${order.couponCode ?? ""}`}</span><span>−{formatBRL(order.discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold"><span>Total</span><span>{formatBRL(order.totalCents)}</span></div>
        {order.address && <p className="text-stone-600">Endereço: {order.address}</p>}
        <p className="text-stone-600">Pagamento: {paymentLabel[order.paymentMethod]}</p>
        {order.paymentMethod === "PIX" && store.pixKey && <p className="text-stone-600">Chave Pix da loja: <strong>{store.pixKey}</strong></p>}
      </div>
      {store.isDemo && combine && (
        <div className="card space-y-2 border-green-600/20 bg-green-50 text-sm">
          <p className="font-medium text-green-900">Loja de demonstração: numa loja de verdade, o WhatsApp da loja abriria agora com esta mensagem pronta:</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-white p-3 font-sans text-[13px] leading-relaxed text-stone-700 ring-1 ring-green-600/10">{message}</pre>
        </div>
      )}
      {store.whatsapp && !(store.isDemo && combine) && !awaiting && order.status !== "CANCELED" && (
        <div className="space-y-1">
          <a className="btn w-full py-3" target="_blank" href={storeWhatsappLink(store.whatsapp, message)}>
            {combine ? "Enviar pedido pelo WhatsApp" : "Avisar a loja no WhatsApp"}
          </a>
          {combine && order.status === "PENDING" && (
            <p className="text-center text-xs text-stone-500">Se a conversa não abriu sozinha, toque no botão. A loja combina o pagamento com você por lá.</p>
          )}
        </div>
      )}
      {!awaiting && order.status !== "CANCELED" && <InstallInvite slug={slug} name={store.name} logoUrl={store.logoUrl} compact />}
      <Link href={`/loja/${slug}`} className="btn-ghost w-full">Voltar ao {terms.catalogLower}</Link>
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
