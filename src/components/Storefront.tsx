"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { placeOrder } from "@/app/loja/[slug]/actions";

type Product = { id: string; name: string; description: string | null; priceCents: number; imageUrl: string | null };
type Section = { id: string; name: string; products: Product[] };
type StoreInfo = {
  slug: string; name: string; description: string | null; address: string | null;
  deliveryFeeCents: number; minOrderCents: number; acceptsDelivery: boolean; acceptsPickup: boolean; accepting: boolean;
};

export function Storefront({ store, sections }: { store: StoreInfo; sections: Section[] }) {
  const router = useRouter();
  const storageKey = `cart:${store.slug}`;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">(store.acceptsDelivery ? "DELIVERY" : "PICKUP");
  const [payment, setPayment] = useState<"PIX" | "CASH" | "CARD_ON_DELIVERY">("PIX");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setCart(JSON.parse(saved));
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch {}
  }, [cart, storageKey]);

  const products = useMemo(() => new Map(sections.flatMap((s) => s.products).map((p) => [p.id, p])), [sections]);
  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && products.has(id)).map(([id, q]) => ({ product: products.get(id)!, quantity: q }));
  const subtotal = lines.reduce((s, l) => s + l.product.priceCents * l.quantity, 0);
  const fee = fulfillment === "DELIVERY" ? store.deliveryFeeCents : 0;
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  const add = (id: string, delta: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(99, (c[id] ?? 0) + delta)) }));

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await placeOrder({
        slug: store.slug,
        cart: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        customerName: String(form.get("customerName") ?? ""),
        customerPhone: String(form.get("customerPhone") ?? ""),
        fulfillment,
        address: String(form.get("address") ?? "") || undefined,
        paymentMethod: payment,
        changeFor: String(form.get("changeFor") ?? "") || undefined,
        notes: String(form.get("notes") ?? "") || undefined,
      });
      if (!result.ok) return setError(result.error);
      setCart({});
      router.push(`/loja/${store.slug}/pedido/${result.orderId}`);
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-28">
      <header className="bg-brand-600 px-4 pb-6 pt-8 text-white">
        <h1 className="text-2xl font-bold">{store.name}</h1>
        {store.description && <p className="mt-1 text-brand-50">{store.description}</p>}
        <p className="mt-3 text-sm text-brand-100">
          {store.accepting ? "Aberto agora" : "Fechado no momento"}
          {store.acceptsDelivery && ` · Entrega ${store.deliveryFeeCents ? formatBRL(store.deliveryFeeCents) : "grátis"}`}
          {store.minOrderCents > 0 && ` · Mínimo ${formatBRL(store.minOrderCents)}`}
        </p>
      </header>

      {sections.length === 0 && <p className="p-6 text-center text-stone-500">O cardápio ainda está sendo montado.</p>}

      {sections.map((s) => (
        <section key={s.id} className="px-4 pt-6">
          <h2 className="mb-2 text-lg font-semibold">{s.name}</h2>
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {s.products.map((p) => (
              <li key={p.id} className="flex gap-3 p-3">
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-20 w-20 flex-none rounded-lg object-cover" />
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

            <input name="customerName" placeholder="Seu nome" className="input" required />
            <input name="customerPhone" placeholder="WhatsApp / telefone" className="input" inputMode="tel" required />
            {fulfillment === "DELIVERY" && <textarea name="address" placeholder="Endereço completo (rua, número, bairro, referência)" className="input" rows={2} required />}

            <div>
              <p className="label">Pagamento</p>
              <select className="input" value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}>
                <option value="PIX">Pix</option>
                <option value="CASH">Dinheiro</option>
                <option value="CARD_ON_DELIVERY">Cartão na entrega</option>
              </select>
            </div>
            {payment === "CASH" && <input name="changeFor" placeholder="Troco para quanto? (opcional)" className="input" inputMode="decimal" />}
            <textarea name="notes" placeholder="Observações (opcional)" className="input" rows={2} />

            <div className="space-y-1 border-t border-stone-100 pt-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              {fulfillment === "DELIVERY" && <div className="flex justify-between"><span>Entrega</span><span>{formatBRL(fee)}</span></div>}
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatBRL(subtotal + fee)}</span></div>
              {subtotal < store.minOrderCents && <p className="text-red-600">Pedido mínimo: {formatBRL(store.minOrderCents)}</p>}
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="btn w-full py-3 text-base" disabled={pending || subtotal < store.minOrderCents}>
              {pending ? "Enviando..." : "Fazer pedido"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
