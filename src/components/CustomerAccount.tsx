"use client";

import { keepOnSubmit } from "./useKeepForm";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { customerLogin, setCustomerPin, updateCustomerProfile } from "@/app/loja/[slug]/actions";

export function CustomerLoginForm({ slug, storeWhatsapp }: { slug: string; storeWhatsapp: string | null }) {
  const [state, action, pending] = useActionState(customerLogin, undefined);
  const askCode = storeWhatsapp
    ? `https://wa.me/${storeWhatsapp}?text=${encodeURIComponent("Olá! Quero um código de acesso para entrar na minha conta do cardápio.")}`
    : null;
  return (
    <form onSubmit={keepOnSubmit(action)} className="card space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <h2 className="font-semibold">Já pediu aqui? Entre na sua conta</h2>
      <p className="text-sm text-stone-600">
        Use o <strong>PIN</strong> que você criou em &quot;Minha conta&quot; ou um <strong>código de acesso</strong> enviado pela loja no WhatsApp.
      </p>
      <input name="phone" placeholder="WhatsApp com DDD" className="input" inputMode="tel" autoComplete="tel" required />
      <input name="pin" placeholder="PIN ou código de acesso" className="input" inputMode="numeric" type="password" maxLength={6} autoComplete="one-time-code" required />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
      {askCode && (
        <a href={askCode} target="_blank" rel="noopener" className="block text-center text-sm text-brand-700 underline">
          Não tenho PIN: pedir código para a loja no WhatsApp
        </a>
      )}
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
