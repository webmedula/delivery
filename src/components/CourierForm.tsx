"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCourier } from "@/app/painel/actions";

export function CourierForm() {
  const [state, action, pending] = useActionState(createCourier, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={action} className="card space-y-3">
      <h2 className="font-semibold">Cadastrar entregador</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1"><label className="label">Nome</label><input name="name" className="input" placeholder="Ex.: Leo" required /></div>
        <div className="min-w-40 flex-1"><label className="label">WhatsApp</label><input name="phone" className="input" placeholder="(11) 98888-7777" inputMode="tel" required /></div>
        <button className="btn" disabled={pending}>{pending ? "..." : "Cadastrar"}</button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
