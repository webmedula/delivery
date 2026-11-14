"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { placeOrder, previewCoupon } from "@/app/loja/[slug]/actions";

type Product = { id: string; name: string; description: string | null; priceCents: number; imageUrl: string | null };
type Section = { id: string; name: string; products: Product[] };
type StoreInfo = {
  slug: string; name: string; description: string | null; address: string | null; logoUrl: string | null;
  deliveryFeeCents: number; minOrderCents: number; acceptsDelivery: boolean; acceptsPickup: boolean; accepting: boolean;
  /** Texto do programa de fidelidade, ex.: "A cada 10 pedidos, ganhe 10% de desconto". */
  loyalty: string | null;
  /** Desconto da recompensa de fidelidade, para calcular o total na sacola. */
  reward: { type: "PERCENT" | "FIXED"; value: number } | null;
  /** Formas de pagamento online (Asaas) ligadas pela loja. */
  online: { pix: boolean; card: boolean };
  /** Loja de demonstração da WebTenda: mostra um aviso no topo. */
  demo?: boolean;
};
type Payment = "ONLINE_PIX" | "ONLINE_CARD" | "PIX" | "CASH" | "CARD_ON_DELIVERY";
export type CustomerInfo = {
  name: string;
  phone: string; // formatado
  marketingOptIn: boolean;
  cpfCnpj: string | null;
  addresses: { id: string; address: string }[];
  loyalty: { stamps: number; ordersRequired: number; rewardAvailable: boolean } | null;
};

function rewardCents(subtotal: number, r: StoreInfo["reward"]) {
  if (!r) return 0;
  return Math.min(subtotal, r.type === "PERCENT" ? Math.round((subtotal * r.value) / 100) : r.value);
}

export function Storefront({ store, sections, customer }: { store: StoreInfo; sections: Section[]; customer: CustomerInfo | null }) {
  const router = useRouter();
  const storageKey = `cart:${store.slug}`;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">(store.acceptsDelivery ? "DELIVERY" : "PICKUP");
  // Com Pix online ligado, ele substitui o Pix pela chave (que exige conferência manual).
  const paymentOptions: { value: Payment; label: string }[] = [
    ...(store.online.pix ? [{ value: "ONLINE_PIX" as const, label: "Pix (pague agora)" }] : [{ value: "PIX" as const, label: "Pix" }]),
    ...(store.online.card ? [{ value: "ONLINE_CARD" as const, label: "Cartão de crédito (pague agora)" }] : []),
    { value: "CASH", label: "Dinheiro" },
    { value: "CARD_ON_DELIVERY", label: "Cartão na entrega" },
  ];
  const [payment, setPayment] = useState<Payment>(paymentOptions[0].value);
  const payOnline = payment === "ONLINE_PIX" || payment === "ONLINE_CARD";
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [addressChoice, setAddressChoice] = useState<string>(customer?.addresses[0]?.id ?? "new");
  const [useReward, setUseReward] = useState(!!customer?.loyalty?.rewardAvailable);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [checkingCoupon, startCouponCheck] = useTransition();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setCart(JSON.parse(saved));
    } catch {}
    // "Pedir de novo" (página Minha conta) monta a sacola e abre com ?sacola=1
    if (new URLSearchParams(window.location.search).get("sacola") === "1") {
      setCheckout(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch {}
  }, [cart, storageKey]);

  const products = useMemo(() => new Map(sections.flatMap((s) => s.products).map((p) => [p.id, p])), [sections]);
  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && products.has(id)).map(([id, q]) => ({ product: products.get(id)!, quantity: q }));
  const subtotal = lines.reduce((s, l) => s + l.product.priceCents * l.quantity, 0);
  const fee = fulfillment === "DELIVERY" ? store.deliveryFeeCents : 0;
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const rewardActive = useReward && !!customer?.loyalty?.rewardAvailable;
  // O desconto do cupom é recalculado no servidor; aqui só mostramos a prévia.
  const discount = rewardActive ? rewardCents(subtotal, store.reward) : coupon ? Math.min(subtotal, coupon.discountCents) : 0;

  // Se a sacola mudar depois de aplicar o cupom, peça para aplicar de novo.
  const subtotalKey = subtotal;
  useEffect(() => { setCoupon(null); }, [subtotalKey]);

  function applyCoupon() {
    setCouponError(null);
    startCouponCheck(async () => {
      const r = await previewCoupon(store.slug, couponInput, subtotal, phone);
      if (r.ok) setCoupon({ code: r.code, discountCents: r.discountCents });
      else { setCoupon(null); setCouponError(r.error); }
    });
  }

  const add = (id: string, delta: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(99, (c[id] ?? 0) + delta)) }));

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await placeOrder({
        slug: store.slug,
        cart: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        customerName: String(form.get("customerName") ?? ""),
        customerPhone: phone,
        fulfillment,
        address:
          (addressChoice !== "new" ? customer?.addresses.find((a) => a.id === addressChoice)?.address : String(form.get("address") ?? "")) ||
          undefined,
        paymentMethod: payment,
        cpfCnpj: payOnline ? String(form.get("cpfCnpj") ?? "") : undefined,
        changeFor: String(form.get("changeFor") ?? "") || undefined,
        notes: String(form.get("notes") ?? "") || undefined,
        useReward: rewardActive,
        couponCode: !rewardActive && coupon ? coupon.code : undefined,
        marketingOptIn: form.get("marketingOptIn") === "on",
      });
      if (!result.ok) return setError(result.error);
      setCart({});
      router.push(`/loja/${store.slug}/pedido/${result.orderId}`);
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-28">
      {store.demo && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Loja de demonstração da WebTenda: pode testar à vontade, nenhum pedido é entregue.{" "}
          <a href="https://webtenda.com.br" className="font-medium underline">Quero uma loja assim</a>
        </div>
      )}
      <header className="bg-brand-600 px-4 pb-6 pt-8 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {store.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logoUrl} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-16 w-16 flex-none rounded-2xl object-cover shadow-md" />
            )}
            <h1 className="text-2xl font-bold">{store.name}</h1>
          </div>
          <Link href={`/loja/${store.slug}/conta`} className="flex-none rounded-full bg-white/15 px-3 py-1 text-sm font-medium hover:bg-white/25">
            {customer ? `Olá, ${customer.name.split(" ")[0]}` : "Minha conta"}
          </Link>
        </div>
        {store.description && <p className="mt-1 text-brand-50">{store.description}</p>}
        <p className="mt-3 text-sm text-brand-100">
          {store.accepting ? "Aberto agora" : "Fechado no momento"}
          {store.acceptsDelivery && ` · Entrega ${store.deliveryFeeCents ? formatBRL(store.deliveryFeeCents) : "grátis"}`}
          {store.minOrderCents > 0 && ` · Mínimo ${formatBRL(store.minOrderCents)}`}
        </p>
      </header>

      {store.loyalty && (
        <Link href={`/loja/${store.slug}/conta`} className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <span className="text-xl" aria-hidden>★</span>
          <span className="flex-1">
            <strong>Programa de fidelidade:</strong> {store.loyalty}.
            {customer?.loyalty && (
              <span className="block text-brand-600">
                {customer.loyalty.rewardAvailable
                  ? "Você já ganhou a sua recompensa! Use no próximo pedido."
                  : `Seus selos: ${customer.loyalty.stamps} de ${customer.loyalty.ordersRequired}.`}
              </span>
            )}
          </span>
        </Link>
      )}

      {sections.length === 0 && <p className="p-6 text-center text-stone-500">O cardápio ainda está sendo montado.</p>}

      {sections.map((s) => (
        <section key={s.id} className="px-4 pt-6">
          <h2 className="mb-2 text-lg font-semibold">{s.name}</h2>
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {s.products.map((p) => (
              <li key={p.id} className="flex gap-3 p-3">
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-20 w-20 flex-none rounded-lg object-cover" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{p.name}</p>
                  {p.description && <p className="text-sm text-stone-500">{p.description}</p>}
                  <p className="mt-1 font-semibold">{formatBRL(p.priceCents)}</p>
                </div>
                {store.accepting && (
                  <div className="flex items-center gap-2 self-center">
                    {cart[p.id] ? (
                      <>
                        <button aria-label="Remover" className="btn-ghost h-8 w-8 p-0" onClick={() => add(p.id, -1)}>−</button>
                        <span className="w-5 text-center">{cart[p.id]}</span>
                      </>
                    ) : null}
                    <button aria-label={`Adicionar ${p.name}`} className="btn h-8 w-8 p-0" onClick={() => add(p.id, 1)}>+</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {count > 0 && !checkout && (
        <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white p-4">
          <button className="btn mx-auto flex w-full max-w-2xl justify-between py-3 text-base" onClick={() => setCheckout(true)}>
            <span>Ver sacola ({count})</span><span>{formatBRL(subtotal)}</span>
          </button>
        </div>
      )}

      {checkout && (
        <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setCheckout(false)}>
          <form
            action={submit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sua sacola</h2>
              <button type="button" className="text-sm text-stone-500" onClick={() => setCheckout(false)}>Fechar</button>
            </div>
            <ul className="space-y-1 text-sm">
              {lines.map((l) => (
                <li key={l.product.id} className="flex justify-between">
                  <span>{l.quantity}× {l.product.name}</span><span>{formatBRL(l.product.priceCents * l.quantity)}</span>
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
              {store.acceptsDelivery && (
                <button type="button" onClick={() => setFulfillment("DELIVERY")} className={fulfillment === "DELIVERY" ? "btn flex-1" : "btn-ghost flex-1"}>Entrega</button>
              )}
              {store.acceptsPickup && (
                <button type="button" onClick={() => setFulfillment("PICKUP")} className={fulfillment === "PICKUP" ? "btn flex-1" : "btn-ghost flex-1"}>Retirar</button>
              )}
            </div>
            {fulfillment === "PICKUP" && store.address && <p className="text-sm text-stone-600">Retirada em: {store.address}</p>}

            <input name="customerName" placeholder="Seu nome" className="input" defaultValue={customer?.name} required />
            {customer ? (
              <p className="text-sm text-stone-600">
                WhatsApp: <strong>{customer.phone}</strong>{" "}
                <Link href={`/loja/${store.slug}/conta`} className="text-brand-700 underline">Não é você?</Link>
              </p>
            ) : (
              <input
                name="customerPhone"
                placeholder="WhatsApp com DDD"
                className="input"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            )}
            {fulfillment === "DELIVERY" && customer && customer.addresses.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="label">Endereço de entrega</legend>
                {customer.addresses.map((a) => (
                  <label key={a.id} className="flex items-start gap-2 rounded-lg border border-stone-200 p-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <input type="radio" name="addressChoice" className="mt-1" checked={addressChoice === a.id} onChange={() => setAddressChoice(a.id)} />
                    <span>{a.address}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 rounded-lg border border-stone-200 p-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="radio" name="addressChoice" checked={addressChoice === "new"} onChange={() => setAddressChoice("new")} />
                  <span>Outro endereço</span>
                </label>
              </fieldset>
            )}
            {fulfillment === "DELIVERY" && (addressChoice === "new" || !customer?.addresses.length) && (
              <textarea name="address" placeholder="Endereço completo (rua, número, bairro, referência)" className="input" rows={2} required />
            )}

            <div>
              <p className="label">Pagamento</p>
              <select className="input" value={payment} onChange={(e) => setPayment(e.target.value as Payment)}>
                {paymentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {payOnline && (
              <div>
                <input name="cpfCnpj" placeholder="Seu CPF" className="input" inputMode="numeric" defaultValue={customer?.cpfCnpj ?? ""} required />
                <p className="mt-1 text-xs text-stone-500">
                  Exigido para o pagamento. {payment === "ONLINE_PIX" ? "O QR Code do Pix aparece na próxima tela." : "Você digita os dados do cartão na próxima tela, em ambiente seguro do Asaas."}
                </p>
              </div>
            )}
            {payment === "CASH" && <input name="changeFor" placeholder="Troco para quanto? (opcional)" className="input" inputMode="decimal" />}
            <textarea name="notes" placeholder="Observações (opcional)" className="input" rows={2} />

            {customer?.loyalty?.rewardAvailable && store.reward && (
              <label className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-700">
                <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} />
                <span>★ Usar minha recompensa de fidelidade neste pedido</span>
              </label>
            )}
            {!rewardActive && (
              <div>
                <div className="flex gap-2">
                  <input
                    placeholder="Cupom de desconto"
                    className="input uppercase"
                    value={couponInput}
                    onChange={(e) => { setCouponInput(e.target.value); setCoupon(null); setCouponError(null); }}
                  />
                  <button type="button" className="btn-ghost" onClick={applyCoupon} disabled={checkingCoupon || !couponInput.trim()}>
                    {checkingCoupon ? "..." : "Aplicar"}
                  </button>
                </div>
                {coupon && <p className="mt-1 text-sm text-green-700">Cupom {coupon.code} aplicado.</p>}
                {couponError && <p className="mt-1 text-sm text-red-600">{couponError}</p>}
              </div>
            )}
            {!customer?.marketingOptIn && (
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" name="marketingOptIn" /> Quero receber promoções da loja pelo WhatsApp
              </label>
            )}

            <div className="space-y-1 border-t border-stone-100 pt-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              {fulfillment === "DELIVERY" && <div className="flex justify-between"><span>Entrega</span><span>{formatBRL(fee)}</span></div>}
              {discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>{rewardActive ? "Recompensa de fidelidade" : `Cupom ${coupon?.code}`}</span><span>−{formatBRL(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatBRL(subtotal - discount + fee)}</span></div>
              {subtotal < store.minOrderCents && <p className="text-red-600">Pedido mínimo: {formatBRL(store.minOrderCents)}</p>}
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="btn w-full py-3 text-base" disabled={pending || subtotal < store.minOrderCents}>
              {pending ? "Enviando..." : payOnline ? "Fazer pedido e pagar" : "Fazer pedido"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
