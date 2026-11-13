"use client";

import { useActionState } from "react";
import { cancelSubscription, subscribe } from "@/app/painel/actions";
import { formatBRL } from "@/lib/money";

type Plan = { code: string; name: string; priceCents: number; maxProducts: number; maxOrdersMonth: number };

export function PlanPicker({
  plans, currentCode, hasSubscription, cpfCnpj, enabled,
}: { plans: Plan[]; currentCode: string; hasSubscription: boolean; cpfCnpj: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(subscribe, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="max-w-xs">
        <label className="label" htmlFor="cpfCnpj">CPF ou CNPJ do responsável</label>
        <input id="cpfCnpj" name="cpfCnpj" defaultValue={cpfCnpj} className="input" inputMode="numeric" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => {
          const current = p.code === currentCode;
          return (
            <div key={p.code} className={`card ${current ? "ring-2 ring-brand-500" : ""}`}>
              <h2 className="font-semibold">{p.name}</h2>
              <p className="text-2xl font-bold">{formatBRL(p.priceCents)}<span className="text-sm font-normal">/mês</span></p>
              <ul className="mt-2 text-sm text-stone-600">
                <li>{p.maxProducts === 0 ? "Produtos ilimitados" : `Até ${p.maxProducts} produtos`}</li>
                <li>{p.maxOrdersMonth === 0 ? "Pedidos ilimitados" : `Até ${p.maxOrdersMonth} pedidos/mês`}</li>
              </ul>
              <button name="planCode" value={p.code} className="btn mt-4 w-full" disabled={pending || !enabled || (current && hasSubscription)}>
                {current && hasSubscription ? "Plano atual" : hasSubscription ? "Mudar para este" : "Assinar"}
              </button>
            </div>
          );
        })}
      </div>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Plano atualizado.</p>}
      <p className="text-xs text-stone-500">Pagamento por Pix, boleto ou cartão, processado pelo Asaas. Você escolhe a forma na fatura.</p>
    </form>
  );
}

export function CancelButton() {
  const [state, action, pending] = useActionState(cancelSubscription, undefined);
  return (
    <form action={action} onSubmit={(e) => { if (!confirm("Cancelar a assinatura? A loja continua funcionando até o fim do período já pago.")) e.preventDefault(); }}>
      <button className="text-sm text-red-600 hover:underline" disabled={pending}>Cancelar assinatura</button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
