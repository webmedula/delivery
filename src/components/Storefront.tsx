"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { placeOrder, previewCoupon } from "@/app/loja/[slug]/actions";
import { TableBar, type TableInfo } from "@/components/TableBar";
import { guessZone } from "@/lib/delivery";
import { InstallInvite } from "@/components/InstallApp";
import { colorSwatch } from "@/lib/variants";
import { REGIONS, type ShippingMethodRow } from "@/lib/shipping";
import { depositFor } from "@/lib/preorder";
import { ShippingFields, emptyShipping, quoteShippingForm, type ShippingConfig, type ShippingForm } from "@/components/ShippingFields";

type Variant = { id: string; color: string | null; size: string | null; stock: number | null; priceCents: number | null };
export type Product = {
  id: string; name: string; description: string | null; priceCents: number; imageUrl: string | null;
  images?: string[];
  compareAtCents?: number | null;
  /** Estoque do produto sem variações (null = não controla). */
  stock?: number | null;
  variants?: Variant[];
};
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
  /** Vitrine em grade com fotos grandes (loja de roupas) em vez da lista do cardápio. */
  grid?: boolean;
  /** A loja fecha pedidos pelo WhatsApp (pagamento combinado na conversa). */
  whatsappCheckout?: boolean;
  /** Envio pelos Correios/transportadora com a tabela de frete da loja (null = não envia). */
  shipping?: ShippingConfig | null;
  /** Encomendas: dias e horários livres, antecedência e sinal (null = pedido para agora). */
  preorder?: { days: { date: string; label: string; times: string[] }[]; minHours: string; depositPercent: number; depositNote: string | null } | null;
  /** Textos do tipo de loja. */
  terms?: { catalog: string; catalogLower: string; emptyCatalog: string; poweredBy: string };
};
type Payment = "WHATSAPP" | "ONLINE_PIX" | "ONLINE_CARD" | "PIX" | "CASH" | "CARD_ON_DELIVERY" | "TAB";

/** Item da sacola: "produto" ou "produto:variação". */
const cartKey = (productId: string, variantId?: string) => (variantId ? `${productId}:${variantId}` : productId);
const splitKey = (key: string) => {
  const [productId, variantId] = key.split(":");
  return { productId, variantId: variantId || undefined };
};
const variantName = (v: Pick<Variant, "color" | "size">) => [v.color, v.size].filter(Boolean).join(" · ");
const isSoldOut = (p: Product) => (p.variants?.length ? p.variants.every((v) => v.stock === 0) : p.stock === 0);
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

export function Storefront({ store, sections, customer, initialProductId, table }: {
  store: StoreInfo; sections: Section[]; customer: CustomerInfo | null; initialProductId?: string;
  /** Aberto pelo QR code da mesa: pedido sem endereço, que entra na conta da mesa. */
  table?: TableInfo;
}) {
  const terms = store.terms ?? { catalog: "Cardápio", catalogLower: "cardápio", emptyCatalog: "O cardápio ainda está sendo montado.", poweredBy: "Cardápio digital por" };
  const router = useRouter();
  // A sacola da mesa fica separada da sacola de entrega do mesmo aparelho.
  const storageKey = table ? `cart:${store.slug}:mesa` : `cart:${store.slug}`;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP" | "SHIPPING" | "TABLE">(
    // Na loja de roupas, retirar na loja é o mais comum; no delivery, a entrega.
    table ? "TABLE" : store.acceptsDelivery && !(store.grid && store.acceptsPickup) ? "DELIVERY" : store.acceptsPickup ? "PICKUP" : store.shipping ? "SHIPPING" : "PICKUP",
  );
  const [shipForm, setShipForm] = useState<ShippingForm>(emptyShipping);
  const shipKey = `envio:${store.slug}`;
  // Com Pix online ligado, ele substitui o Pix pela chave (que exige conferência manual).
  const pre = store.preorder ?? null;
  // Encomenda com sinal: o sinal é pago antes (online ou pela chave Pix), então não dá para pagar só na porta.
  const signal = !!pre && pre.depositPercent > 0 && pre.depositPercent < 100;
  const upfront = !!pre && pre.depositPercent > 0;
  const paymentOptions: { value: Payment; label: string }[] = table ? [
    // Na mesa: entra na conta e paga no fim, ou paga agora pelo celular (se a loja ligou o pagamento online).
    { value: "TAB" as const, label: "Pagar no final, na conta da mesa" },
    ...(store.online.pix ? [{ value: "ONLINE_PIX" as const, label: "Pix agora (pague pelo celular)" }] : []),
    ...(store.online.card ? [{ value: "ONLINE_CARD" as const, label: "Cartão de crédito agora" }] : []),
  ] : [
    ...(store.whatsappCheckout ? [{ value: "WHATSAPP" as const, label: "Combinar pelo WhatsApp" }] : []),
    ...(store.online.pix
      ? [{ value: "ONLINE_PIX" as const, label: signal ? "Pix: pague o sinal agora" : "Pix (pague agora)" }]
      : [{ value: "PIX" as const, label: signal ? "Pix: sinal pela chave da loja" : "Pix" }]),
    ...(store.online.card ? [{ value: "ONLINE_CARD" as const, label: signal ? "Cartão de crédito: pague o sinal agora" : "Cartão de crédito (pague agora)" }] : []),
    // Pedido enviado pelo correio não tem como pagar na porta.
    ...(fulfillment === "SHIPPING" || upfront
      ? []
      : [
          { value: "CASH" as const, label: "Dinheiro" },
          { value: "CARD_ON_DELIVERY" as const, label: store.grid ? "Cartão na entrega ou retirada" : "Cartão na entrega" },
        ]),
  ];
  const [paymentChoice, setPayment] = useState<Payment>(paymentOptions[0].value);
  const payment = paymentOptions.some((o) => o.value === paymentChoice) ? paymentChoice : paymentOptions[0].value;
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
  const [openProductId, setOpenProductId] = useState<string | null>(initialProductId ?? null);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("");
  const scheduleDay = pre?.days.find((d) => d.date === scheduleDate);
  const scheduleReady = !pre || (!!scheduleDay && scheduleDay.times.includes(scheduleTime));

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
  // Endereço de envio fica guardado neste aparelho para a próxima compra.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(shipKey);
      if (saved) setShipForm({ ...emptyShipping, ...JSON.parse(saved), methodId: "" });
    } catch {}
  }, [shipKey]);

  const products = useMemo(() => new Map(sections.flatMap((s) => s.products).map((p) => [p.id, p])), [sections]);
  const lines = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .flatMap(([key, quantity]) => {
      const { productId, variantId } = splitKey(key);
      const product = products.get(productId);
      if (!product) return [];
      const hasVariants = !!product.variants?.length;
      const variant = variantId ? product.variants?.find((v) => v.id === variantId) : undefined;
      // Variação que saiu do catálogo, ou produto que passou a ter variações: some da sacola.
      if (hasVariants !== !!variant) return [];
      return [{
        key, product, variant, quantity,
        name: variant ? `${product.name} (${variantName(variant)})` : product.name,
        unitPriceCents: variant?.priceCents ?? product.priceCents,
      }];
    });
  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const shipQuote = quoteShippingForm(fulfillment === "SHIPPING" ? store.shipping : null, shipForm, subtotal);
  const fee =
    fulfillment === "SHIPPING" ? (shipQuote.selected?.feeCents ?? 0)
    : fulfillment !== "DELIVERY" ? 0
    : hasZones ? (zone?.feeCents ?? 0) : store.deliveryFeeCents;
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const rewardActive = useReward && !!customer?.loyalty?.rewardAvailable;
  // O desconto do cupom é recalculado no servidor; aqui só mostramos a prévia.
  const discount = rewardActive ? rewardCents(subtotal, store.reward) : coupon ? Math.min(subtotal, coupon.discountCents) : 0;

  // Se a sacola mudar depois de aplicar o cupom, peça para aplicar de novo.
  const totalToPay = subtotal - discount + fee;
  const depositPreview = pre ? depositFor(totalToPay, pre.depositPercent) : null;
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
  /** Quantidade do produto na sacola, somando todas as cores e tamanhos. */
  const inCart = (productId: string) => Object.entries(cart).reduce((s, [k, q]) => (splitKey(k).productId === productId ? s + q : s), 0);
  const openProduct = openProductId ? products.get(openProductId) : undefined;

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await placeOrder({
        slug: store.slug,
        cart: lines.map((l) => ({ productId: l.product.id, variantId: l.variant?.id, quantity: l.quantity })),
        customerName: String(form.get("customerName") ?? ""),
        customerPhone: phone,
        fulfillment,
        tableCode: table?.code,
        deliveryZoneId: fulfillment === "DELIVERY" && zoneId ? zoneId : undefined,
        shipping: fulfillment === "SHIPPING" ? shipForm : undefined,
        address:
          (addressChoice !== "new" ? customer?.addresses.find((a) => a.id === addressChoice)?.address : String(form.get("address") ?? "")) ||
          undefined,
        paymentMethod: payment,
        cpfCnpj: payOnline ? String(form.get("cpfCnpj") ?? "") : undefined,
        changeFor: String(form.get("changeFor") ?? "") || undefined,
        notes: String(form.get("notes") ?? "") || undefined,
        useReward: rewardActive,
        couponCode: !rewardActive && coupon && !table ? coupon.code : undefined,
        marketingOptIn: form.get("marketingOptIn") === "on",
        schedule: pre ? { date: scheduleDate, time: scheduleTime } : undefined,
      });
      if (!result.ok) return setError(result.error);
      setCart({});
      if (fulfillment === "SHIPPING") try { localStorage.setItem(shipKey, JSON.stringify({ ...shipForm, methodId: "" })); } catch {}
      // Pedido para fechar no WhatsApp: a página do pedido abre a conversa com a mensagem pronta.
      router.push(`/loja/${store.slug}/pedido/${result.orderId}${result.whatsappUrl ? "?enviar=1" : ""}`);
    });
  }

  const cover = sections.flatMap((s) => s.products).find((p) => p.imageUrl)?.imageUrl ?? null;
  const chips = table ? [
    store.eta.pickup && { icon: <IconBag />, text: `Fica pronto em ${store.eta.pickup}` },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[] : [
    pre && { icon: <IconCalendar />, text: `Encomendas com ${pre.minHours} de antecedência` },
    pre?.depositNote && { icon: <IconReceipt />, text: pre.depositNote },
    store.acceptsDelivery && {
      icon: <IconBike />,
      text: `Entrega ${deliveryFeeText(store)}${store.eta.delivery ? ` · ${store.eta.delivery}` : ""}`,
    },
    store.acceptsPickup && { icon: <IconBag />, text: `${store.grid ? "Retirada na loja" : "Retirada no local"}${store.eta.pickup ? ` · ${store.eta.pickup}` : ""}` },
    store.shipping && { icon: <IconBox />, text: `Envio para ${shippingReach(store.shipping)}` },
    store.shipping?.freeAboveCents && { icon: <IconBox />, text: `Frete grátis acima de ${formatBRL(store.shipping.freeAboveCents)}` },
    store.whatsappCheckout && { icon: <IconChat />, text: "Pedido pelo WhatsApp" },
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
              {store.accepting ? (pre ? "Aceitando encomendas" : "Aberto agora") : pre ? "Encomendas pausadas" : "Fechado no momento"}
            </span>
            {chips.map((c) => (
              <span key={c.text} className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                <span className="text-stone-500">{c.icon}</span>
                {c.text}
              </span>
            ))}
          </div>
        </header>

        {/* Na mesa, a faixa da mesa (conta, garçom) vem antes de tudo. */}
        {table && <TableBar slug={store.slug} table={table} />}

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

        {!table && <InstallInvite slug={store.slug} name={store.name} logoUrl={store.logoUrl} />}

        {sections.length > 1 && <CategoryNav sections={sections} />}

        {sections.length === 0 && <p className="p-10 text-center text-stone-500">{terms.emptyCatalog}</p>}

        {store.grid && sections.map((s) => (
          <section key={s.id} id={`cat-${s.id}`} className="scroll-mt-16 px-3 pt-7 md:px-6">
            <h2 className="mb-3 flex items-baseline gap-2 px-1 text-xl font-bold tracking-tight text-stone-900">
              {s.name}
              <span className="text-sm font-medium text-stone-400">{s.products.length}</span>
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {s.products.map((p) => (
                <GridCard key={p.id} product={p} quantity={inCart(p.id)} onOpen={() => setOpenProductId(p.id)} />
              ))}
            </ul>
          </section>
        ))}

        {!store.grid && sections.map((s) => (
          <section key={s.id} id={`cat-${s.id}`} className="scroll-mt-16 px-3 pt-7 md:px-6">
            <h2 className="mb-3 flex items-baseline gap-2 px-1 text-xl font-bold tracking-tight text-stone-900">
              {s.name}
              <span className="text-sm font-medium text-stone-400">{s.products.length}</span>
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {s.products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  quantity={p.variants?.length ? inCart(p.id) : (cart[p.id] ?? 0)}
                  accepting={store.accepting}
                  onAdd={(d) => (p.variants?.length || isSoldOut(p) ? setOpenProductId(p.id) : add(p.id, d))}
                />
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-12 text-center text-xs text-stone-400">
          {terms.poweredBy} <a href="https://webtenda.com.br" className="font-medium text-stone-500 hover:text-stone-700">WebTenda</a>
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
            <ul className="divide-y divide-stone-100 text-sm">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center gap-3 py-2">
                  {store.grid && l.product.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.product.imageUrl} alt="" ref={hideIfBroken} onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-12 w-10 flex-none rounded-md bg-stone-100 object-cover" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-stone-900">{l.product.name}</span>
                    {l.variant && <span className="block text-xs text-stone-500">{variantName(l.variant)}</span>}
                  </span>
                  <span className="flex flex-none items-center rounded-full ring-1 ring-stone-200">
                    <button type="button" aria-label="Diminuir" className="h-7 w-7 rounded-full font-semibold text-brand-700 hover:bg-stone-100" onClick={() => add(l.key, -1)}>−</button>
                    <span className="w-5 text-center font-semibold tabular-nums">{l.quantity}</span>
                    <button
                      type="button"
                      aria-label="Aumentar"
                      className="h-7 w-7 rounded-full font-semibold text-brand-700 hover:bg-stone-100 disabled:opacity-30"
                      disabled={(l.variant ? l.variant.stock : l.product.stock) != null && l.quantity >= (l.variant ? l.variant.stock! : l.product.stock!)}
                      onClick={() => add(l.key, 1)}
                    >+</button>
                  </span>
                  <span className="w-20 flex-none text-right tabular-nums">{formatBRL(l.unitPriceCents * l.quantity)}</span>
                </li>
              ))}
            </ul>
            {lines.length === 0 && <p className="text-sm text-stone-500">Sua sacola está vazia.</p>}

            {table && (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-600/15">
                <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">{table.label}</span>
                O pedido vai direto para a cozinha e chega na sua mesa.
              </p>
            )}
            {!table && <div className="flex gap-2">
              {store.acceptsDelivery && (
                <button type="button" onClick={() => setFulfillment("DELIVERY")} className={fulfillment === "DELIVERY" ? "btn flex-1" : "btn-ghost flex-1"}>Entrega</button>
              )}
              {store.acceptsPickup && (
                <button type="button" onClick={() => setFulfillment("PICKUP")} className={fulfillment === "PICKUP" ? "btn flex-1" : "btn-ghost flex-1"}>Retirar</button>
              )}
              {store.shipping && (
                <button type="button" onClick={() => setFulfillment("SHIPPING")} className={fulfillment === "SHIPPING" ? "btn flex-1" : "btn-ghost flex-1"}>Envio</button>
              )}
            </div>}
            {fulfillment === "PICKUP" && store.address && <p className="text-sm text-stone-600">Retirada em: {store.address}</p>}
            {pre && (
              <fieldset className="space-y-2 rounded-xl bg-brand-50/60 p-3 ring-1 ring-brand-100">
                <legend className="sr-only">Dia e horário</legend>
                <p className="text-sm font-semibold text-stone-900">
                  {fulfillment === "DELIVERY" ? "Para quando é a entrega?" : "Quando você vem buscar?"}
                </p>
                {pre.days.length === 0 ? (
                  <p className="text-sm text-stone-600">A agenda está cheia no momento. Fale com a loja pelo WhatsApp.</p>
                ) : (
                  <>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                      {pre.days.map((d) => {
                        const [wd, dm] = d.label.split(", ");
                        const active = d.date === scheduleDate;
                        return (
                          <button
                            key={d.date}
                            type="button"
                            aria-pressed={active}
                            onClick={() => { setScheduleDate(d.date); if (!d.times.includes(scheduleTime)) setScheduleTime(""); }}
                            className={`flex w-14 flex-none flex-col items-center rounded-xl py-2 text-center transition ${active ? "bg-brand-600 text-white shadow-md shadow-brand-700/20" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:ring-brand-300"}`}
                          >
                            <span className={`text-[11px] font-semibold uppercase ${active ? "text-white/85" : "text-stone-500"}`}>{wd}</span>
                            <span className="text-[15px] font-bold tabular-nums">{dm}</span>
                          </button>
                        );
                      })}
                    </div>
                    {scheduleDay ? (
                      <div className="flex flex-wrap gap-2">
                        {scheduleDay.times.map((t) => (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={t === scheduleTime}
                            onClick={() => setScheduleTime(t)}
                            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold tabular-nums transition ${t === scheduleTime ? "bg-brand-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:ring-brand-300"}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-500">Escolha o dia. Encomendas com pelo menos {pre.minHours} de antecedência.</p>
                    )}
                  </>
                )}
              </fieldset>
            )}
            {payment === "WHATSAPP" && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                Ao enviar, abrimos o WhatsApp da loja com o seu pedido pronto. Vocês combinam o pagamento{fulfillment === "DELIVERY" ? " e a entrega" : ""} por lá.
              </p>
            )}

            <input name="customerName" placeholder="Seu nome" className="input" defaultValue={customer?.name} required />
            {customer ? (
              <p className="text-sm text-stone-600">
                WhatsApp: <strong>{customer.phone}</strong>{" "}
                <Link href={`/loja/${store.slug}/conta`} className="text-brand-700 underline">Não é você?</Link>
              </p>
            ) : (
              <input
                name="customerPhone"
                placeholder={table ? `WhatsApp com DDD (opcional${store.loyalty ? ", para ganhar selos" : ""})` : "WhatsApp com DDD"}
                className="input"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required={!table}
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
            {fulfillment === "SHIPPING" && store.shipping && (
              <ShippingFields config={store.shipping} value={shipForm} onChange={setShipForm} subtotalCents={subtotal} />
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
            {fulfillment !== "SHIPPING" && (fulfillment === "DELIVERY" ? store.eta.delivery : store.eta.pickup) && (
              <p className="text-sm text-stone-600">
                ⏱ {fulfillment === "DELIVERY" ? "Entrega" : fulfillment === "TABLE" ? "Chega na mesa" : "Fica pronto"} em {fulfillment === "DELIVERY" ? store.eta.delivery : store.eta.pickup}
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
            {!rewardActive && !table && (
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
            {!customer?.marketingOptIn && (!table || phone.trim() !== "") && (
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
              {fulfillment === "SHIPPING" && (
                <div className="flex justify-between">
                  <span>Frete{shipQuote.selected ? ` (${shipQuote.selected.name})` : ""}</span>
                  <span>{!shipQuote.selected ? "informe o CEP" : shipQuote.selected.free ? "grátis" : formatBRL(fee)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>{rewardActive ? "Recompensa de fidelidade" : `Cupom ${coupon?.code}`}</span><span>−{formatBRL(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatBRL(totalToPay)}</span></div>
              {depositPreview && payment !== "WHATSAPP" && (
                <div className="mt-1 space-y-0.5 rounded-lg bg-brand-50 px-3 py-2 text-brand-800">
                  <div className="flex justify-between font-semibold"><span>Sinal para confirmar ({pre!.depositPercent}%)</span><span>{formatBRL(depositPreview)}</span></div>
                  <div className="flex justify-between text-[13px]"><span>Restante na {fulfillment === "DELIVERY" ? "entrega" : "retirada"}</span><span>{formatBRL(totalToPay - depositPreview)}</span></div>
                </div>
              )}
              {depositPreview && payment === "WHATSAPP" && (
                <p className="text-[13px] text-stone-600">A loja pede um sinal de {formatBRL(depositPreview)} para confirmar. Vocês combinam o pagamento no WhatsApp.</p>
              )}
              {!table && subtotal < store.minOrderCents && <p className="text-red-600">Pedido mínimo: {formatBRL(store.minOrderCents)}</p>}
              {payment === "TAB" && <p className="text-xs text-stone-500">Nada a pagar agora: o valor entra na conta da {table?.label ?? "mesa"}.</p>}
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              className={`btn w-full py-3 text-base ${payment === "WHATSAPP" ? "bg-[#1f9d55]! hover:bg-[#188a49]!" : ""}`}
              disabled={pending || lines.length === 0 || (!table && subtotal < store.minOrderCents) || (fulfillment === "SHIPPING" && !shipQuote.selected) || !scheduleReady}
            >
              {pending ? "Enviando..."
                : pre && !scheduleReady ? "Escolha o dia e o horário"
                : payment === "WHATSAPP" ? (pre ? "Enviar encomenda pelo WhatsApp" : "Enviar pedido pelo WhatsApp")
                : pre ? (payOnline ? (depositPreview ? "Encomendar e pagar o sinal" : "Encomendar e pagar") : "Fazer encomenda")
                : payOnline ? "Fazer pedido e pagar" : table ? `Pedir para a ${table.label}` : "Fazer pedido"}
            </button>
          </form>
        </div>
      )}
      {openProduct && (
        <ProductSheet
          key={openProduct.id}
          product={openProduct}
          accepting={store.accepting}
          cart={cart}
          shareUrl={`/loja/${store.slug}/produto/${openProduct.id}`}
          onClose={() => setOpenProductId(null)}
          onAdd={(variantId, qty) => {
            add(cartKey(openProduct.id, variantId), qty);
            setOpenProductId(null);
          }}
        />
      )}
    </div>
  );
}

/** "todo o Brasil", "SP" ou "Sudeste e Sul". */
function shippingReach(cfg: ShippingConfig) {
  const active = cfg.methods.filter((m) => m.active);
  const has = (k: keyof ShippingMethodRow) => active.some((m) => m[k] !== null);
  const regions = REGIONS.filter((r) => has(`${r.key}Cents` as keyof ShippingMethodRow));
  if (regions.length === REGIONS.length) return "todo o Brasil";
  if (regions.length === 0) return cfg.originUf ?? "o seu estado";
  return regions.map((r) => r.label).join(", ").replace(/, ([^,]*)$/, " e $1");
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
function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
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

function IconBox() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12Z" />
    </svg>
  );
}

function discountPercent(p: Product) {
  return p.compareAtCents && p.compareAtCents > p.priceCents ? Math.round((1 - p.priceCents / p.compareAtCents) * 100) : 0;
}

/** Cores do produto, sem repetir, na ordem cadastrada. */
function productColors(p: Product) {
  const out: string[] = [];
  for (const v of p.variants ?? []) if (v.color && !out.includes(v.color)) out.push(v.color);
  return out;
}

/** "a partir de" quando as variações têm preços diferentes. */
function priceRange(p: Product) {
  const prices = (p.variants ?? []).map((v) => v.priceCents ?? p.priceCents);
  if (prices.length === 0) return { min: p.priceCents, varies: false };
  const min = Math.min(...prices);
  return { min, varies: Math.max(...prices) !== min };
}

/** Card da vitrine em grade (loja de roupas): foto grande, preço e cores. */
function GridCard({ product: p, quantity, onOpen }: { product: Product; quantity: number; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const off = discountPercent(p);
  const soldOut = isSoldOut(p);
  const colors = productColors(p);
  const { min, varies } = priceRange(p);
  return (
    <li>
      <button type="button" onClick={onOpen} className="group block w-full text-left">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-stone-200 ring-1 ring-stone-900/5">
          {p.imageUrl && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.imageUrl}
              alt=""
              loading="lazy"
              ref={(el) => { if (el?.complete && el.naturalWidth === 0) setBroken(true); }}
              onError={() => setBroken(true)}
              className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] ${soldOut ? "opacity-60 grayscale" : ""}`}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-100 to-brand-200 text-4xl font-bold text-brand-700/50">{p.name.charAt(0)}</div>
          )}
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {off > 0 && !soldOut && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white shadow">-{off}%</span>}
            {soldOut && <span className="rounded-full bg-stone-900/80 px-2 py-0.5 text-xs font-semibold text-white">Esgotado</span>}
          </div>
          {quantity > 0 && (
            <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-brand-700 shadow ring-1 ring-brand-500/40">
              {quantity} na sacola
            </span>
          )}
        </div>
        <div className="px-0.5 pt-2">
          <p className="line-clamp-2 text-[15px] font-medium leading-snug text-stone-900">{p.name}</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
            {varies && <span className="text-xs text-stone-500">a partir de</span>}
            <span className="font-bold tabular-nums text-stone-900">{formatBRL(min)}</span>
            {off > 0 && <span className="text-xs tabular-nums text-stone-400 line-through">{formatBRL(p.compareAtCents!)}</span>}
          </p>
          {colors.length > 0 && (
            <span className="mt-1.5 flex items-center gap-1">
              {colors.slice(0, 6).map((c) => <ColorDot key={c} color={c} />)}
              {colors.length > 6 && <span className="text-xs text-stone-500">+{colors.length - 6}</span>}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function ColorDot({ color, size = "sm" }: { color: string; size?: "sm" | "lg" }) {
  const hex = colorSwatch(color);
  return (
    <span
      title={color}
      aria-hidden
      className={`inline-block flex-none rounded-full ring-1 ring-stone-900/15 ${size === "lg" ? "h-7 w-7" : "h-3.5 w-3.5"}`}
      style={hex ? { background: hex } : { background: "conic-gradient(#f472b6,#facc15,#4ade80,#60a5fa,#f472b6)" }}
    />
  );
}

/** Detalhe do produto: fotos, escolha de cor e tamanho (com o que está esgotado riscado) e quantidade. */
function ProductSheet({ product: p, accepting, cart, shareUrl, onClose, onAdd }: {
  product: Product; accepting: boolean; cart: Record<string, number>; shareUrl: string;
  onClose: () => void; onAdd: (variantId: string | undefined, qty: number) => void;
}) {
  const photos = [p.imageUrl, ...(p.images ?? [])].filter((u): u is string => !!u);
  const [photo, setPhoto] = useState(0);
  const variants = p.variants ?? [];
  const colors = productColors(p);
  const sizes = [...new Set(variants.map((v) => v.size).filter((s): s is string => !!s))];
  const firstAvailable = variants.find((v) => v.stock !== 0);
  const [color, setColor] = useState<string | null>(colors.length ? (firstAvailable?.color ?? colors[0]) : null);
  const [size, setSize] = useState<string | null>(sizes.length === 1 ? sizes[0] : null);
  const [qty, setQty] = useState(1);
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const find = (c: string | null, s: string | null) => variants.find((v) => (v.color ?? null) === (colors.length ? c : null) && (v.size ?? null) === (sizes.length ? s : null));
  const variant = variants.length ? find(color, size) : undefined;
  const needsChoice = variants.length > 0 && !variant;
  const stock = variants.length ? (variant ? variant.stock : null) : (p.stock ?? null);
  const already = cart[cartKey(p.id, variant?.id)] ?? 0;
  const left = stock === null ? 99 : Math.max(0, stock - already);
  const soldOut = variants.length ? !!variant && variant.stock === 0 : p.stock === 0;
  const unit = variant?.priceCents ?? p.priceCents;
  const off = discountPercent(p);
  // Cor esgotada em todos os tamanhos / tamanho esgotado na cor escolhida.
  const colorOut = (c: string) => variants.filter((v) => v.color === c).every((v) => v.stock === 0);
  const sizeOut = (s: string) => {
    const v = find(color, s);
    return !v || v.stock === 0;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  useEffect(() => { setQty(1); setHint(null); }, [variant?.id]);

  function share() {
    const url = new URL(shareUrl, window.location.href).toString();
    if (navigator.share) navigator.share({ title: p.name, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function submit() {
    if (needsChoice) return setHint(colors.length && !color ? "Escolha a cor." : sizes.length && !size ? "Escolha o tamanho." : "Essa combinação não existe.");
    if (soldOut || left < 1) return setHint("Sem estoque dessa opção.");
    onAdd(variant?.id, Math.min(qty, left));
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={p.name}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:flex-row sm:rounded-3xl motion-safe:animate-[sacola_.2s_ease-out]"
      >
        <div className="relative flex-none bg-stone-100 sm:w-1/2">
          {photos.length > 0 ? (
            <>
              <div
                className="flex h-[42vh] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] sm:h-full sm:min-h-[520px] [&::-webkit-scrollbar]:hidden"
                onScroll={(e) => setPhoto(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
              >
                {photos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src + i} src={src} alt={i === 0 ? p.name : ""} className="h-full w-full flex-none snap-center object-cover" />
                ))}
              </div>
              {photos.length > 1 && (
                <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                  {photos.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === photo ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />)}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-[30vh] items-center justify-center text-6xl font-bold text-stone-300 sm:h-full">{p.name.charAt(0)}</div>
          )}
          <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-xl text-stone-700 shadow-md">×</button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div>
              <h2 className="text-xl font-bold leading-tight text-stone-900 [text-wrap:balance]">{p.name}</h2>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-stone-900">{formatBRL(unit)}</span>
                {off > 0 && <span className="tabular-nums text-stone-400 line-through">{formatBRL(p.compareAtCents!)}</span>}
                {off > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">-{off}%</span>}
              </p>
            </div>

            {colors.length > 0 && (
              <div>
                <p className="mb-2 text-sm text-stone-600">Cor: <strong className="text-stone-900">{color ?? "escolha"}</strong></p>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setColor(c); if (size && sizeOutFor(variants, c, size)) setSize(null); }}
                      aria-label={c}
                      aria-pressed={color === c}
                      className={`relative rounded-full p-0.5 ring-2 transition ${color === c ? "ring-brand-600" : "ring-transparent hover:ring-stone-300"} ${colorOut(c) ? "opacity-40" : ""}`}
                    >
                      <ColorDot color={c} size="lg" />
                      {colorOut(c) && <span className="absolute inset-0 m-auto h-0.5 w-8 rotate-45 rounded bg-stone-500" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sizes.length > 0 && (
              <div>
                <p className="mb-2 text-sm text-stone-600">Tamanho: <strong className="text-stone-900">{size ?? "escolha"}</strong></p>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => {
                    const out = sizeOut(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={out}
                        onClick={() => setSize(s)}
                        aria-pressed={size === s}
                        className={`min-w-12 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          size === s ? "border-brand-600 bg-brand-600 text-white" : out ? "cursor-not-allowed border-stone-200 text-stone-300 line-through" : "border-stone-300 text-stone-800 hover:border-stone-500"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!needsChoice && stock !== null && stock > 0 && stock <= 3 && (
              <p className="text-sm font-medium text-amber-700">{stock === 1 ? "Última peça!" : `Últimas ${stock} peças`}</p>
            )}
            {soldOut && <p className="text-sm font-medium text-red-600">Esgotado nesta opção.</p>}
            {p.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-stone-600">{p.description}</p>}
            <button type="button" onClick={share} className="text-sm font-medium text-brand-700 underline underline-offset-2">
              {copied ? "Link copiado!" : "Compartilhar este produto"}
            </button>
          </div>

          {accepting ? (
            <div className="flex items-center gap-3 border-t border-stone-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <span className="flex flex-none items-center rounded-full ring-1 ring-stone-200">
                <button type="button" aria-label="Diminuir" className="h-10 w-10 rounded-full text-lg font-semibold text-brand-700" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <span className="w-6 text-center font-bold tabular-nums">{qty}</span>
                <button type="button" aria-label="Aumentar" className="h-10 w-10 rounded-full text-lg font-semibold text-brand-700 disabled:opacity-30" disabled={qty >= left} onClick={() => setQty((q) => Math.min(left, q + 1))}>+</button>
              </span>
              <button type="button" onClick={submit} disabled={soldOut} className="btn flex-1 py-3 text-base disabled:opacity-50">
                {soldOut ? "Esgotado" : hint ?? `Adicionar · ${formatBRL(unit * qty)}`}
              </button>
            </div>
          ) : (
            <p className="border-t border-stone-100 p-4 text-center text-sm text-stone-500">A loja não está recebendo pedidos agora.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function sizeOutFor(variants: Variant[], color: string, size: string) {
  const v = variants.find((x) => x.color === color && x.size === size);
  return !v || v.stock === 0;
}
