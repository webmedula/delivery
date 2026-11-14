"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { countAudience, createCampaign, markSent } from "@/app/painel/campanhas/actions";
import { AUDIENCES, renderCampaignMessage } from "@/lib/campaign-message";
import { keepOnSubmit } from "./useKeepForm";

const TEMPLATES = [
  { label: "Cupom de volta", text: "Oi {nome}, que saudade! 😋\nPara você voltar a pedir na {loja}, use o cupom {cupom} no seu próximo pedido.\nPeça aqui: {link}" },
  { label: "Novidade no cardápio", text: "Oi {nome}! Tem novidade no cardápio da {loja} 🎉\nDá uma olhada: {link}" },
  { label: "Promoção do dia", text: "Oi {nome}! Hoje tem promoção na {loja}: use o cupom {cupom}.\nPeça pelo link: {link}" },
];

export function CampaignForm({
  coupons, storeName, link, loyaltyEnabled,
}: { coupons: { id: string; code: string; label: string }[]; storeName: string; link: string; loyaltyEnabled: boolean }) {
  const [state, action, pending] = useActionState(createCampaign, undefined);
  const [audience, setAudience] = useState("all");
  const [days, setDays] = useState("30");
  const [message, setMessage] = useState(TEMPLATES[0].text);
  const [couponId, setCouponId] = useState(coupons[0]?.id ?? "");
  const [count, setCount] = useState<number | null>(null);
  const [, startCount] = useTransition();

  useEffect(() => {
    setCount(null);
    const t = setTimeout(() => startCount(async () => setCount(await countAudience(audience, days))), 250);
    return () => clearTimeout(t);
  }, [audience, days]);

  const coupon = coupons.find((c) => c.id === couponId)?.code;
  const preview = renderCampaignMessage(message, { name: "Maria Souza", store: storeName, link, coupon: coupon ?? "(escolha um cupom)" });

  return (
    <form onSubmit={keepOnSubmit(action)} className="card space-y-4">
      <h2 className="font-semibold">Nova campanha</h2>
      <div><label className="label">Nome (só você vê)</label><input name="name" placeholder="Ex.: Volta sexta-feira" className="input" required /></div>

      <div>
        <p className="label">Para quem</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.filter((a) => a.key !== "reward" || loyaltyEnabled).map((a) => (
            <label key={a.key} className="flex gap-2 rounded-lg border border-stone-200 p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" name="audience" value={a.key} checked={audience === a.key} onChange={() => setAudience(a.key)} className="mt-0.5" />
              <span><strong className="block">{a.label}</strong><span className="text-stone-500">{a.help}</span></span>
            </label>
          ))}
        </div>
        {audience === "inactive" && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            Sem pedir há pelo menos
            <input name="inactiveDays" value={days} onChange={(e) => setDays(e.target.value)} className="input max-w-20" inputMode="numeric" />
            dias
          </label>
        )}
        <p className="mt-2 text-sm text-stone-600">
          {count === null ? "Contando clientes..." : <><strong>{count}</strong> cliente(s) vão receber. Só entra quem aceitou receber promoções.</>}
        </p>
      </div>

      <div>
        <label className="label">Cupom (opcional)</label>
        <select name="couponId" value={couponId} onChange={(e) => setCouponId(e.target.value)} className="input">
          <option value="">Sem cupom</option>
          {coupons.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="label mb-0">Mensagem</label>
          <div className="flex flex-wrap gap-1">
            {TEMPLATES.map((t) => (
              <button key={t.label} type="button" onClick={() => setMessage(t.text)} className="rounded-full border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100">{t.label}</button>
            ))}
          </div>
        </div>
        <textarea name="message" value={message} onChange={(e) => setMessage(e.target.value)} className="input" rows={5} required />
        <p className="mt-1 text-xs text-stone-500">Use {"{nome}"}, {"{loja}"}, {"{cupom}"} e {"{link}"}. A linha para sair da lista é colocada sozinha no fim.</p>
      </div>

      <div>
        <p className="label">Como o cliente vai ver</p>
        <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-[#dcf8c6] px-3 py-2 text-sm text-stone-800 shadow-sm">{preview}</div>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn" disabled={pending || count === 0}>{pending ? "Criando..." : "Criar campanha e ir para o envio"}</button>
    </form>
  );
}

/** Abre o WhatsApp com a mensagem pronta e marca como enviado. */
export function SendButton({ recipientId, href, label = "Enviar", big = false }: { recipientId: string; href: string; label?: string; big?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={() => start(async () => { await markSent(recipientId); router.refresh(); })}
      className={big ? "btn w-full py-3 text-base" : "btn px-3 py-1.5"}
      aria-disabled={pending}
    >
      {label}
    </a>
  );
}
