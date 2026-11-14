"use client";

import { keepOnSubmit } from "./useKeepForm";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { customerLogin, setCustomerPin, updateCustomerProfile } from "@/app/loja/[slug]/actions";

export function CustomerLoginForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(customerLogin, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="card space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <h2 className="font-semibold">Entrar com seu PIN</h2>
      <p className="text-sm text-stone-600">
        Já pediu aqui e criou um PIN? Entre para ver seus pedidos, endereços e selos de fidelidade.
      </p>
      <input name="phone" placeholder="WhatsApp com DDD" className="input" inputMode="tel" required />
      <input name="pin" placeholder="PIN (4 a 6 números)" className="input" inputMode="numeric" type="password" maxLength={6} required />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}

export function CustomerProfileForm({ slug, name, marketingOptIn }: { slug: string; name: string; marketingOptIn: boolean }) {
  const [state, action, pending] = useActionState(updateCustomerProfile, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <div><label className="label">Seu nome</label><input name="name" defaultValue={name} className="input" required /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="marketingOptIn" defaultChecked={marketingOptIn} /> Quero receber promoções da loja pelo WhatsApp
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Salvo.</p>}
      <button className="btn-ghost" disabled={pending}>Salvar</button>
    </form>
  );
}

export function CustomerPinForm({ slug, hasPin }: { slug: string; hasPin: boolean }) {
  const [state, action, pending] = useActionState(setCustomerPin, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <p className="text-sm text-stone-600">
        {hasPin
          ? "Você já tem um PIN. Pode trocar abaixo."
          : "Crie um PIN para entrar na sua conta em outro celular ou computador."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input name="pin" placeholder="Novo PIN" className="input" inputMode="numeric" type="password" maxLength={6} required />
        <input name="pin2" placeholder="Repita o PIN" className="input" inputMode="numeric" type="password" maxLength={6} required />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">PIN salvo.</p>}
      <button className="btn-ghost" disabled={pending}>{hasPin ? "Trocar PIN" : "Criar PIN"}</button>
    </form>
  );
}

/** Monta a sacola com os itens de um pedido antigo e abre o cardápio com ela. */
export function ReorderButton({ slug, items }: { slug: string; items: { productId: string; quantity: number }[] }) {
  const router = useRouter();
  if (items.length === 0) return <span className="text-xs text-stone-500">Itens indisponíveis</span>;
  return (
    <button
      className="btn px-3 py-1.5"
      onClick={() => {
        const cart: Record<string, number> = {};
        for (const i of items) cart[i.productId] = Math.min(99, (cart[i.productId] ?? 0) + i.quantity);
        try { localStorage.setItem(`cart:${slug}`, JSON.stringify(cart)); } catch {}
        router.push(`/loja/${slug}?sacola=1`);
      }}
    >
      Pedir de novo
    </button>
  );
}
