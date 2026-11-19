import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { paymentLabel } from "@/lib/order-status";
import { storeWhatsappLink } from "@/lib/order-message";
import { storeUrl } from "@/lib/store-url";
import { AutoRefresh } from "@/components/AutoRefresh";
import { InstallInvite } from "@/components/InstallApp";
import { PixPayment } from "@/components/PixPayment";
import { getPixQrCode, syncOrderPayment } from "@/lib/payments";
import { getSessionCustomer } from "@/lib/customers";
import { balanceDue, depositPaid } from "@/lib/preorder";
import { canCustomerCancel, customerToStoreMessage, formatAppointment, formatDuration, formatTimeRange, googleCalendarUrl } from "@/lib/booking";
import { googleMapsLink } from "@/lib/delivery";
import { cancelByCustomer, confirmPresence } from "../../booking-actions";

export const dynamic = "force-dynamic";

export default async function AppointmentPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const find = () => db.order.findFirst({ where: { id, fulfillment: "APPOINTMENT", store: { slug } }, include: { items: true, store: true } });
  let order = await find();
  if (!order) notFound();
  if (order.paymentStatus === "AWAITING") {
    await syncOrderPayment(order);
    order = (await find())!;
  }
  const { store } = order;
  const now = new Date();
  const start = order.scheduledFor!;
  const end = order.endsAt ?? new Date(start.getTime() + 30 * 60_000);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const awaiting = order.paymentStatus === "AWAITING" && order.status !== "CANCELED";
  const canceled = order.status === "CANCELED";
  const done = order.status === "COMPLETED";
  const past = end < now;
  const me = await getSessionCustomer(store.id);
  const suggestPin = !!me && me.id === order.customerId && !me.pinHash;
  const pix = awaiting && order.paymentMethod === "ONLINE_PIX" ? await getPixQrCode(order) : null;
  const signal = order.depositCents;
  const signalPaid = depositPaid(order);
  const due = balanceDue(order);
  const cancelable = !awaiting && canCustomerCancel(order, store.bookingCancelHours, now);
  // Pede a confirmação de presença nas 48 horas antes do horário.
  const askConfirm = !canceled && !done && !awaiting && !order.customerConfirmedAt && order.createdAt.getTime() < now.getTime() - 60 * 60_000 && start.getTime() - now.getTime() < 48 * 60 * 60_000 && !past;
  const services = order.items.map((i) => i.name).join(" + ");
  const title = `${services} - ${store.name}`;
  const pageUrl = `${await storeUrl(slug)}/agendamento/${order.id}`;
  const details = `${services}${order.professionalName ? ` com ${order.professionalName}` : ""}\n${pageUrl}`;

  const status = canceled
    ? order.noShowAt ? "Não compareceu" : "Cancelado"
    : awaiting ? "Aguardando pagamento"
    : done ? "Atendido"
    : order.customerConfirmedAt ? "Presença confirmada"
    : "Horário marcado";

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      {awaiting && <AutoRefresh seconds={5} />}
      <div className="card text-center">
        <p className="text-sm text-stone-500">{store.name}</p>
        <h1 className="mt-1 text-2xl font-bold first-letter:uppercase">{formatAppointment(start, now)}</h1>
        <p className="text-stone-600">{formatTimeRange(start, end)} · {formatDuration(minutes)}</p>
        <p className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-medium ${canceled ? "bg-stone-100 text-stone-600" : awaiting ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          {!canceled && !awaiting && "✓ "}{status}
        </p>
        <div className="mt-4 space-y-1 text-[15px]">
          <p className="font-semibold text-stone-900">{services}</p>
          {order.professionalName && <p className="text-stone-600">com {order.professionalName}</p>}
          {store.address && (
            <p className="text-stone-600">
              📍 <a href={googleMapsLink(store.address)} target="_blank" rel="noopener" className="underline decoration-stone-300 underline-offset-2">{store.address}</a>
            </p>
          )}
        </div>
        {order.paymentStatus === "PAID" && !signal && <p className="mt-3 text-sm font-medium text-green-700">✓ Pagamento confirmado</p>}
        {signal && signalPaid && <p className="mt-3 text-sm font-medium text-green-700">✓ Sinal de {formatBRL(signal)} pago · falta {formatBRL(due)} no dia</p>}
        {order.paymentStatus === "EXPIRED" && <p className="mt-3 text-sm text-stone-600">O pagamento não foi concluído e o horário foi liberado.</p>}
        {order.paymentStatus === "FAILED" && <p className="mt-3 text-sm text-stone-600">Não foi possível gerar o pagamento. Agende de novo com outra forma de pagamento.</p>}
      </div>

      {askConfirm && (
        <form action={confirmPresence} className="card space-y-3 border-brand-100 bg-brand-50 text-center">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={order.id} />
          <p className="font-semibold text-stone-900">Você vem no seu horário?</p>
          <button className="btn w-full py-3">Sim, confirmo minha presença</button>
          {cancelable && <p className="text-xs text-stone-500">Não pode vir? Cancele aqui embaixo para liberar o horário.</p>}
        </form>
      )}

      {awaiting && (
        <div className="card space-y-3">
          <h2 className="text-center font-semibold">
            {signal ? <>Pague o sinal de {formatBRL(signal)} para garantir o horário</> : <>Pague {formatBRL(order.totalCents)} para garantir o horário</>}
          </h2>
          {signal && <p className="text-center text-sm text-stone-600">O restante, {formatBRL(order.totalCents - signal)}, você paga no dia.</p>}
          {order.paymentMethod === "ONLINE_PIX" && pix && <PixPayment image={pix.encodedImage} payload={pix.payload} />}
          {order.paymentMethod === "ONLINE_PIX" && !pix && order.paymentUrl && <a href={order.paymentUrl} target="_blank" className="btn w-full py-3">Abrir página de pagamento Pix</a>}
          {order.paymentMethod === "ONLINE_CARD" && order.paymentUrl && <a href={order.paymentUrl} className="btn w-full py-3">Pagar com cartão de crédito</a>}
          <p className="text-center text-xs text-stone-500">O horário fica reservado por 30 minutos. Esta página atualiza sozinha quando o pagamento for confirmado.</p>
        </div>
      )}

      {order.paymentMethod === "PIX" && signal && !signalPaid && !canceled && store.pixKey && (
        <p className="card bg-amber-50 text-sm text-amber-900">
          Para garantir o horário, envie o sinal de <strong>{formatBRL(signal)}</strong> para a chave Pix: <strong className="select-all">{store.pixKey}</strong>. Depois mande o comprovante no WhatsApp da barbearia.
        </p>
      )}

      {!canceled && !done && !past && !awaiting && (
        <div className="grid grid-cols-2 gap-2">
          <a href={googleCalendarUrl({ title, start, end, location: store.address, details })} target="_blank" rel="noopener" className="btn-ghost justify-center text-center text-sm">+ Google Agenda</a>
          <a href={`/loja/${slug}/agendamento/${order.id}/calendario`} className="btn-ghost justify-center text-center text-sm">+ Agenda do iPhone</a>
        </div>
      )}

      <div className="card space-y-2 text-sm">
        {order.items.map((i) => (
          <div key={i.id} className="flex justify-between"><span>{i.name}</span><span>{formatBRL(i.unitPriceCents * i.quantity)}</span></div>
        ))}
        {order.discountCents > 0 && (
          <div className="flex justify-between text-green-700">
            <span>{order.loyaltyReward ? "Recompensa de fidelidade" : `Cupom ${order.couponCode ?? ""}`}</span><span>−{formatBRL(order.discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-stone-100 pt-2 font-semibold"><span>Total</span><span>{formatBRL(order.totalCents)}</span></div>
        {signal && (
          <>
            <div className={`flex justify-between ${signalPaid ? "text-green-700" : ""}`}><span>Sinal{signalPaid ? " (pago)" : ""}</span><span>{formatBRL(signal)}</span></div>
            <div className="flex justify-between"><span>Restante no dia</span><span>{formatBRL(order.totalCents - signal)}</span></div>
          </>
        )}
        <p className="text-stone-600">Pagamento: {paymentLabel[order.paymentMethod]}</p>
        {order.notes && <p className="text-stone-600">Recado: {order.notes}</p>}
      </div>

      {store.whatsapp && !canceled && !awaiting && !store.isDemo && (
        <a className="btn w-full py-3" target="_blank" href={storeWhatsappLink(store.whatsapp, customerToStoreMessage({ ...order, scheduledFor: start }, pageUrl, now))}>
          Falar com a barbearia no WhatsApp
        </a>
      )}

      {cancelable && (
        <form action={cancelByCustomer} className="text-center">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={order.id} />
          <button className="text-sm text-red-700 underline">Cancelar este horário</button>
          {signalPaid && <p className="mt-1 text-xs text-stone-500">Sobre a devolução do sinal, fale com a barbearia.</p>}
        </form>
      )}
      {awaiting && (
        <form action={cancelByCustomer} className="text-center">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={order.id} />
          <button className="text-sm text-stone-500 underline">Desistir e liberar o horário</button>
        </form>
      )}
      {!cancelable && !canceled && !done && !past && !awaiting && store.bookingCancelHours >= 0 && (
        <p className="text-center text-xs text-stone-500">O prazo para cancelar pelo link já passou. Se não puder vir, avise a barbearia.</p>
      )}

      {!canceled && <InstallInvite slug={slug} name={store.name} logoUrl={store.logoUrl} compact />}
      <Link href={`/loja/${slug}`} className="btn-ghost w-full">{canceled || done || past ? "Agendar outro horário" : "Voltar para a agenda"}</Link>
      {suggestPin ? (
        <Link href={`/loja/${slug}/conta`} className="card block space-y-1 border-brand-100 bg-brand-50 text-sm text-brand-700">
          <strong className="block">Sua conta foi criada neste aparelho ✓</strong>
          Crie um PIN em &quot;Minha conta&quot; para ver seus horários também em outro celular.
        </Link>
      ) : order.customerId ? (
        <Link href={`/loja/${slug}/conta`} className="block text-center text-sm text-brand-700">Ver meus horários e selos</Link>
      ) : null}
    </main>
  );
}
