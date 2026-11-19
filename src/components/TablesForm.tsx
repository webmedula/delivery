"use client";

import { useActionState } from "react";
import { createTables } from "@/app/painel/actions";

/** Cria mesas numeradas de uma vez (ex.: Mesa 1 a Mesa 12) ou uma mesa só. */
export function TablesForm({ suggestFrom }: { suggestFrom: number }) {
  const [state, action, pending] = useActionState(createTables, undefined);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Criar mesas</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32 flex-1">
          <label className="label" htmlFor="prefix">Nome</label>
          <input id="prefix" name="prefix" className="input" defaultValue="Mesa" placeholder="Mesa, Varanda, Balcão" />
        </div>
        <div className="w-24">
          <label className="label" htmlFor="from">Do número</label>
          <input id="from" name="from" className="input" inputMode="numeric" defaultValue={suggestFrom} key={`f${suggestFrom}`} required />
        </div>
        <div className="w-24">
          <label className="label" htmlFor="to">Até</label>
          <input id="to" name="to" className="input" inputMode="numeric" defaultValue={suggestFrom + 9} key={`t${suggestFrom}`} />
        </div>
        <button className="btn" disabled={pending}>{pending ? "..." : "Criar"}</button>
      </div>
      <p className="text-xs text-stone-500">Ex.: Mesa de 1 até 10 cria Mesa 1, Mesa 2... Mesa 10. Para uma mesa só, deixe &quot;Até&quot; igual ao primeiro número.</p>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">{state.created === 1 ? "1 mesa criada." : `${state.created} mesas criadas.`} Agora é só imprimir os QR codes.</p>}
    </form>
  );
}
