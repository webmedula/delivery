"use client";

import { keepOnSubmit } from "./useKeepForm";
import { useActionState, useRef, useEffect, useState } from "react";
import { createCoupon, updateLoyalty } from "@/app/painel/actions";

function DiscountFields({ type: initialType, value }: { type: "PERCENT" | "FIXED"; value: string }) {
  const [type, setType] = useState(initialType);
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="label">Tipo de desconto</label>
        <select name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input">
          <option value="PERCENT">Porcentagem (%)</option>
          <option value="FIXED">Valor fixo (R$)</option>
        </select>
      </div>
      <div>
        <label className="label">{type === "PERCENT" ? "Desconto (%)" : "Desconto (R$)"}</label>
        <input name="value" defaultValue={value} className="input" inputMode="decimal" required />
      </div>
    </div>
  );
}

export function CouponForm() {
  const [state, action, pending] = useActionState(createCoupon, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} onSubmit={keepOnSubmit(action)} className="card space-y-3">
      <h2 className="font-semibold">Novo cupom</h2>
      <div><label className="label">Código</label><input name="code" placeholder="BEMVINDO10" className="input uppercase" required /></div>
      <DiscountFields type="PERCENT" value="10" />
      <div className="grid grid-cols-3 gap-2">
        <div><label className="label">Pedido mínimo (R$)</label><input name="minOrder" placeholder="0,00" className="input" inputMode="decimal" /></div>
        <div><label className="label">Limite de usos</label><input name="maxUses" placeholder="Sem limite" className="input" inputMode="numeric" /></div>
        <div><label className="label">Válido até</label><input name="expiresAt" type="date" className="input" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="oncePerCustomer" defaultChecked /> Cada cliente usa uma vez só</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="firstOrderOnly" /> Só para o primeiro pedido do cliente</label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Cupom criado.</p>}
      <button className="btn" disabled={pending}>{pending ? "Criando..." : "Criar cupom"}</button>
    </form>
  );
}

export function LoyaltyForm(props: { enabled: boolean; ordersRequired: number; type: "PERCENT" | "FIXED"; value: string; minOrder: string }) {
  const [state, action, pending] = useActionState(updateLoyalty, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="card space-y-3">
      <h2 className="font-semibold">Programa de fidelidade</h2>
      <p className="text-sm text-stone-600">
        Cartão de selos digital: cada pedido <strong>concluído</strong> vale um selo. Ao completar o cartão, o cliente ganha o desconto no próximo pedido.
      </p>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="loyaltyEnabled" defaultChecked={props.enabled} /> Programa ativo</label>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Pedidos para ganhar</label><input name="ordersRequired" defaultValue={props.ordersRequired} className="input" inputMode="numeric" required /></div>
        <div><label className="label">Pedido mínimo p/ selo (R$)</label><input name="minOrder" defaultValue={props.minOrder} className="input" inputMode="decimal" /></div>
      </div>
      <DiscountFields type={props.type} value={props.value} />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Salvo.</p>}
      <button className="btn" disabled={pending}>{pending ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}
