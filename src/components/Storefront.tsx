"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { placeOrder, previewCoupon } from "@/app/loja/[slug]/actions";
import { guessZone } from "@/lib/delivery";

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
  /** Bairros atendidos (vazio = taxa única deliveryFeeCents). */
  zones: { id: string; name: string; feeCents: number }[];
  /** Tempo estimado, ex.: "40 a 60 min" (null = a loja não informou). */
  eta: { delivery: string | null; pickup: string | null };
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
  const zoneList = useMemo(() => store.zones.map((z) => ({ ...z, active: true })), [store.zones]);
  const [zoneId, setZoneId] = useState<string>(() => guessZone(zoneList, customer?.addresses[0]?.address)?.id ?? "");
  const zone = store.zones.find((z) => z.id === zoneId);
  const hasZones = store.zones.length > 0;
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
  const fee = fulfillment !== "DELIVERY" ? 0 : hasZones ? (zone?.feeCents ?? 0) : store.deliveryFeeCents;
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
        deliveryZoneId: fulfillment === "DELIVERY" && zoneId ? zoneId : undefined,
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

  const cover = sections.flatMap((s) => s.products).find((p) => p.imageUrl)?.imageUrl ?? null;
  const chips = [
    store.acceptsDelivery && {
      icon: <IconBike />,
      text: `Entrega ${deliveryFeeText(store)}${store.eta.delivery ? ` · ${store.eta.delivery}` : ""}`,
    },
    store.acceptsPickup && { icon: <IconBag />, text: `Retirada no local${store.eta.pickup ? ` · ${store.eta.pickup}` : ""}` },
    store.minOrderCents > 0 && { icon: <IconReceipt />, text: `Mínimo ${formatBRL(store.minOrderCents)}` },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];

  return (
    <div className="min-h-screen bg-stone-100/70 pb-32">
      {store.demo && (
        <div className="bg-stone-900 px-4 py-2 text-center text-[13px] leading-snug text-stone-200">
          Loja de demonstração da WebTenda: pode testar à vontade, nenhum pedido é entregue.{" "}
          <a href="https://webtenda.com.br" className="whitespace-nowrap font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">Quero uma loja assim →</a>
        </div>
      )}

      <div className="mx-auto max-w-5xl md:px-6 md:pt-6">
        {/* Capa: a primeira foto do cardápio sobre a cor da loja (sem foto, só a cor) */}
        <div className="relative h-52 overflow-hidden bg-brand-700 sm:h-56 md:h-64 md:rounded-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,var(--color-brand-500),var(--color-brand-700)_75%)]" />
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl(cover)}
              alt=""
              ref={hideIfBroken}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              className="absolute inset-0 h-full w-full object-cover md:left-auto md:w-[62%] md:[mask-image:linear-gradient(to_right,transparent,black_40%)]"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
          <Link
            href={`/loja/${store.slug}/conta`}
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-1.5 text-sm font-semibold text-stone-800 shadow-md shadow-black/15 transition hover:bg-white md:right-4 md:top-4"
          >
            <IconUser />
            {customer ? `Olá, ${customer.name.split(" ")[0]}` : "Minha conta"}
          </Link>
        </div>

        {/* Identidade da loja */}
        <header className="relative mx-3 -mt-10 rounded-2xl bg-white px-4 pb-4 pt-3 shadow-[0_8px_30px_-12px_rgba(28,25,23,0.25)] ring-1 ring-stone-900/5 md:mx-6 md:-mt-14 md:px-6 md:pb-5">
          <div className="flex items-end gap-3 md:gap-4">
            {store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.logoUrl}
                alt=""
                ref={hideIfBroken}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
                className="-mt-10 h-20 w-20 flex-none rounded-xl bg-white object-cover shadow-lg ring-4 ring-white md:-mt-14 md:h-24 md:w-24"
              />
            ) : (
              <div className="-mt-10 flex h-20 w-20 flex-none items-center justify-center rounded-xl bg-brand-600 text-3xl font-bold text-white shadow-lg ring-4 ring-white md:-mt-14 md:h-24 md:w-24">
                {store.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 pb-0.5">
              <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight text-stone-900 [text-wrap:balance] md:text-[2rem]">{store.name}</h1>
            </div>
          </div>
          {store.description && <p className="mt-2 text-[15px] leading-relaxed text-stone-600 [text-wrap:pretty]">{store.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] [&>span]:whitespace-nowrap">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${store.accepting ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15" : "bg-stone-100 text-stone-600 ring-1 ring-stone-900/10"}`}>
              <span className="relative flex h-2 w-2">
                {store.accepting && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${store.accepting ? "bg-emerald-500" : "bg-stone-400"}`} />
              </span>
              {store.accepting ? "Aberto agora" : "Fechado no momento"}
            </span>
            {chips.map((c) => (
              <span key={c.text} className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                <span className="text-stone-500">{c.icon}</span>
                {c.text}
              </span>
            ))}
          </div>
        </header>

        {store.loyalty && (
          <Link
            href={`/loja/${store.slug}/conta`}
            className="group mx-3 mt-3 flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3.5 text-white shadow-md shadow-brand-700/20 md:mx-6"
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/20 text-lg ring-1 ring-white/30" aria-hidden>★</span>
            <span className="min-w-0 flex-1 text-sm leading-snug">
              <strong className="block text-[15px]">Programa de fidelidade</strong>
              <span className="text-white/90 [text-wrap:pretty]">{store.loyalty.charAt(0).toUpperCase() + store.loyalty.slice(1)}.</span>
              {customer?.loyalty && (
                customer.loyalty.rewardAvailable ? (
                  <span className="mt-1 block font-semibold">Você já ganhou a sua recompensa! Use no próximo pedido.</span>
                ) : (
                  <span className="mt-2 flex items-center gap-2">
                    <span className="flex flex-wrap gap-1">
                      {Array.from({ length: customer.loyalty.ordersRequired }, (_, i) => (
                        <span key={i} className={`h-1.5 w-3 rounded-full ${i < customer.loyalty!.stamps ? "bg-white" : "bg-white/30"}`} />
                      ))}
                    </span>
                    <span className="whitespace-nowrap text-xs text-white/90">Seus selos: {customer.loyalty.stamps} de {customer.loyalty.ordersRequired}</span>
                  </span>
                )
              )}
            </span>
            <span className="text-2xl leading-none text-white transition group-hover:translate-x-0.5" aria-hidden>›</span>
          </Link>
        )}

        {sections.length > 1 && <CategoryNav sections={sections} />}

        {sections.length === 0 && <p className="p-10 text-center text-stone-500">O cardápio ainda está sendo montado.</p>}

        {sections.map((s) => (
          <section key={s.id} id={`cat-${s.id}`} className="scroll-mt-16 px-3 pt-7 md:px-6">
            <h2 className="mb-3 flex items-baseline gap-2 px-1 text-xl font-bold tracking-tight text-stone-900">
              {s.name}
              <span className="text-sm font-medium text-stone-400">{s.products.length}</span>
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {s.products.map((p) => (
                <ProductCard key={p.id} product={p} quantity={cart[p.id] ?? 0} accepting={store.accepting} onAdd={(d) => add(p.id, d)} />
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-12 text-center text-xs text-stone-400">
          Cardápio digital por <a href="https://webtenda.com.br" className="font-medium text-stone-500 hover:text-stone-700">WebTenda</a>
        </p>
      </div>

      {count > 0 && !checkout && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 [background:linear-gradient(to_top,rgb(245_245_244/0.95)_40%,transparent)] motion-safe:animate-[sacola_.25s_ease-out]">
          <button
            className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3.5 text-left text-white shadow-xl shadow-brand-700/30 ring-1 ring-black/5 transition hover:bg-brand-700 active:scale-[0.99]"
            onClick={() => setCheckout(true)}
          >
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-sm font-bold tabular-nums text-brand-700">{count}</span>
            <span className="flex-1 font-semibold">Ver sacola</span>
            <span className="text-base font-bold tabular-nums">{formatBRL(subtotal)}</span>
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
                    <input
                      type="radio"
                      name="addressChoice"
                      className="mt-1"
                      checked={addressChoice === a.id}
                      onChange={() => {
                        setAddressChoice(a.id);
                        const guess = guessZone(zoneList, a.address);
                        if (guess) setZoneId(guess.id);
                      }}
                    />
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
            {fulfillment === "DELIVERY" && hasZones && (
              <div>
                <label className="label" htmlFor="zone">Seu bairro</label>
                <select id="zone" className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
                  <option value="" disabled>Escolha o bairro</option>
                  {store.zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name} · {z.feeCents ? formatBRL(z.feeCents) : "grátis"}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-stone-500">Seu bairro não está na lista? Fale com a loja antes de pedir.</p>
              </div>
            )}
            {(fulfillment === "DELIVERY" ? store.eta.delivery : store.eta.pickup) && (
              <p className="text-sm text-stone-600">
                ⏱ {fulfillment === "DELIVERY" ? "Entrega" : "Fica pronto"} em {fulfillment === "DELIVERY" ? store.eta.delivery : store.eta.pickup}
              </p>
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
              {fulfillment === "DELIVERY" && (
                <div className="flex justify-between">
                  <span>Entrega{zone ? ` (${zone.name})` : ""}</span>
                  <span>{hasZones && !zone ? "escolha o bairro" : formatBRL(fee)}</span>
                </div>
              )}
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

function deliveryFeeText(store: StoreInfo) {
  if (store.zones.length === 0) return store.deliveryFeeCents ? formatBRL(store.deliveryFeeCents) : "grátis";
  const min = Math.min(...store.zones.map((z) => z.feeCents));
  const max = Math.max(...store.zones.map((z) => z.feeCents));
  if (max === 0) return "grátis";
  return min === max ? formatBRL(min) : `de ${min ? formatBRL(min) : "grátis"} a ${formatBRL(max)}`;
}

/** A foto pode falhar antes do React ligar o onError (página vinda do servidor): confere ao montar. */
function hideIfBroken(el: HTMLImageElement | null) {
  if (el?.complete && el.naturalWidth === 0 && !/\.svg(\?|$)/i.test(el.currentSrc || el.src)) el.style.display = "none";
}

/** Foto do Unsplash: pede uma versão larga para a capa, em vez da miniatura quadrada. */
function coverUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname !== "images.unsplash.com") return url;
    u.searchParams.set("w", "1200");
    u.searchParams.set("h", "520");
    u.searchParams.set("fit", "crop");
    return u.toString();
  } catch {
    return url;
  }
}

/** Barra de categorias que gruda no topo e acompanha a rolagem. */
function CategoryNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(`cat-${s.id}`)).filter((e): e is HTMLElement => !!e);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.slice(4));
      },
      { rootMargin: "-72px 0px -65% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  // Mantém a categoria ativa visível na barra (rolagem horizontal no celular).
  useEffect(() => {
    const chip = navRef.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    const nav = navRef.current;
    if (chip && nav) nav.scrollTo({ left: chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  return (
    <nav className="sticky top-0 z-10 mt-4 border-b border-stone-200/70 bg-stone-100/85 backdrop-blur-lg md:mx-6 md:mt-5 md:rounded-2xl md:border md:bg-white/85">
      <div ref={navRef} className="flex gap-2 overflow-x-auto px-3 py-2.5 pr-10 [mask-image:linear-gradient(to_right,black_85%,transparent)] md:[mask-image:none] [scrollbar-width:none] md:px-3 [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#cat-${s.id}`}
            data-cat={s.id}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`cat-${s.id}`)?.scrollIntoView({ behavior: "smooth" });
              setActive(s.id);
            }}
            className={`flex-none whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              active === s.id ? "bg-brand-600 text-white shadow-sm shadow-brand-700/20" : "bg-white text-stone-600 ring-1 ring-stone-900/10 hover:text-stone-900 md:bg-stone-100 md:ring-0"
            }`}
          >
            {s.name}
          </a>
        ))}
      </div>
    </nav>
  );
}

function ProductCard({ product: p, quantity, accepting, onAdd }: { product: Product; quantity: number; accepting: boolean; onAdd: (delta: number) => void }) {
  const [broken, setBroken] = useState(false);
  const photo = p.imageUrl && !broken;
  const control = accepting && (
    quantity > 0 ? (
      <div className="flex items-center rounded-full bg-white shadow-md ring-1 ring-stone-900/10">
        <button aria-label="Remover" className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold text-brand-700 hover:bg-stone-100" onClick={() => onAdd(-1)}>−</button>
        <span className="w-5 text-center text-sm font-bold tabular-nums text-stone-900">{quantity}</span>
        <button aria-label={`Adicionar ${p.name}`} className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold text-brand-700 hover:bg-stone-100" onClick={() => onAdd(1)}>+</button>
      </div>
    ) : (
      <button
        aria-label={`Adicionar ${p.name}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xl font-semibold leading-none text-white shadow-md shadow-black/20 ring-2 ring-white transition hover:bg-brand-700 active:scale-95"
        onClick={() => onAdd(1)}
      >
        +
      </button>
    )
  );

  return (
    <li
      className={`flex gap-3 rounded-2xl p-3 ${quantity > 0 ? "" : "bg-white"} shadow-[0_1px_2px_rgba(28,25,23,0.06)] ring-1 transition md:hover:shadow-[0_10px_30px_-12px_rgba(28,25,23,0.25)] ${
        quantity > 0 ? "bg-brand-50 ring-brand-500/50" : "ring-stone-900/[0.07]"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <p className="font-semibold leading-snug text-stone-900">{p.name}</p>
        {p.description && <p className="mt-1 line-clamp-2 text-sm leading-snug text-stone-500 [text-wrap:pretty]">{p.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <p className="text-base font-bold tabular-nums text-stone-900">{formatBRL(p.priceCents)}</p>
          {!photo && control}
        </div>
      </div>
      {photo && (
        <div className="relative h-28 w-28 flex-none md:h-32 md:w-32">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.imageUrl!} alt="" loading="lazy" ref={(el) => { if (el?.complete && el.naturalWidth === 0) setBroken(true); }} onError={() => setBroken(true)} className="h-full w-full rounded-xl object-cover" />
          {control && <div className="absolute bottom-1.5 right-1.5">{control}</div>}
        </div>
      )}
    </li>
  );
}

function IconBike() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><path d="M15 6h2l3 11.5M5.5 17.5 9 10h7l-4 7.5M9 10 7.5 6H5" />
    </svg>
  );
}
function IconBag() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 7h12l1 13H5L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  );
}
function IconReceipt() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
