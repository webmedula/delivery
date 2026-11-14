"use client";

import { useActionState, useEffect, useRef } from "react";
import { createDeliveryZone, deleteDeliveryZone, toggleDeliveryZone, updateDeliveryZoneFee } from "@/app/painel/actions";

type Zone = { id: string; name: string; fee: string; active: boolean };

/** Bairros atendidos e a taxa de cada um. */
export function DeliveryZones({ zones }: { zones: Zone[] }) {
  const [state, action, pending] = useActionState(createDeliveryZone, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      form.current?.querySelector<HTMLInputElement>("input[name=name]")?.focus();
    }
  }, [state]);

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Bairros e taxas de entrega</h2>
        <p className="text-sm text-stone-500">
          Cadastre os bairros que você atende com a taxa de cada um. O cliente escolhe o bairro na sacola e a taxa entra sozinha.
          Sem bairros cadastrados, vale a taxa única acima para qualquer endereço.
        </p>
      </div>

      {zones.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {zones.map((z) => (
            <li key={z.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${z.active ? "" : "bg-stone-50 text-stone-400"}`}>
              <span className="min-w-0 flex-1 font-medium">{z.name}{!z.active && " (pausado)"}</span>
              <form action={updateDeliveryZoneFee} className="flex items-center gap-1">
                <input type="hidden" name="id" value={z.id} />
                <span className="text-stone-500">R$</span>
                <input name="fee" defaultValue={z.fee} className="input w-20! py-1!" inputMode="decimal" aria-label={`Taxa de ${z.name}`} />
                <button className="btn-ghost px-2 py-1">Salvar</button>
              </form>
              <form action={toggleDeliveryZone}>
                <input type="hidden" name="id" value={z.id} />
                <button className="btn-ghost px-2 py-1">{z.active ? "Pausar" : "Ativar"}</button>
              </form>
              <form action={deleteDeliveryZone}>
                <input type="hidden" name="id" value={z.id} />
                <button className="px-2 py-1 text-red-600 hover:underline">Excluir</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form ref={form} action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1"><label className="label">Bairro</label><input name="name" placeholder="Ex.: Centro" className="input" required /></div>
        <div className="w-28"><label className="label">Taxa (R$)</label><input name="fee" placeholder="5,00" className="input" inputMode="decimal" /></div>
        <button className="btn" disabled={pending}>{pending ? "..." : "Adicionar"}</button>
      </form>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
