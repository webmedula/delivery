"use client";

import { useActionState } from "react";
import { savePreorderSettings } from "@/app/painel/encomendas/actions";
import { DEPOSIT_OPTIONS, MIN_HOURS_OPTIONS, WEEKDAYS } from "@/lib/preorder";

type Values = {
  minHours: number; maxDays: number; weekdays: number[]; times: string; dailyLimit: string; closedDates: string; depositPercent: number;
  onlinePix: boolean;
};

export function PreorderSettingsForm({ values: v }: { values: Values }) {
  const [state, action, pending] = useActionState(savePreorderSettings, undefined);
  const hoursOptions = MIN_HOURS_OPTIONS.some((o) => o.hours === v.minHours) ? MIN_HOURS_OPTIONS : [...MIN_HOURS_OPTIONS, { hours: v.minHours, label: `${v.minHours} horas` }];
  return (
    <form action={action} className="card space-y-4">
      <div>
        <h2 className="font-semibold">Regras das encomendas</h2>
        <p className="text-sm text-stone-500">O cliente só consegue escolher dias e horários dentro destas regras.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="preorderMinHours">Antecedência mínima</label>
          <select id="preorderMinHours" name="preorderMinHours" defaultValue={v.minHours} className="input">
            {hoursOptions.map((o) => <option key={o.hours} value={o.hours}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="preorderMaxDays">Aceitar até quantos dias à frente</label>
          <input id="preorderMaxDays" name="preorderMaxDays" defaultValue={v.maxDays} className="input" inputMode="numeric" />
        </div>
      </div>
      <fieldset>
        <legend className="label">Dias em que você entrega ou o cliente retira</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((name, i) => (
            <label key={name} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="checkbox" name="preorderWeekdays" value={i} defaultChecked={v.weekdays.includes(i)} className="accent-brand-600" />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="preorderTimes">Horários de retirada ou entrega</label>
        <input id="preorderTimes" name="preorderTimes" defaultValue={v.times} placeholder="9h, 11h, 14h, 16h, 18h" className="input" />
        <p className="mt-1 text-xs text-stone-500">Separe por vírgula. O cliente escolhe um destes horários.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="preorderDailyLimit">Máximo de encomendas por dia</label>
          <input id="preorderDailyLimit" name="preorderDailyLimit" defaultValue={v.dailyLimit} placeholder="Sem limite" className="input" inputMode="numeric" />
          <p className="mt-1 text-xs text-stone-500">Quando o dia lota, ele some da agenda do cliente.</p>
        </div>
        <div>
          <label className="label" htmlFor="preorderClosedDates">Dias fechados (feriados, folgas)</label>
          <input id="preorderClosedDates" name="preorderClosedDates" defaultValue={v.closedDates} placeholder="25/12, 01/01" className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="depositPercent">Sinal para confirmar a encomenda</label>
        <select id="depositPercent" name="depositPercent" defaultValue={v.depositPercent} className="input">
          {DEPOSIT_OPTIONS.map((p) => (
            <option key={p} value={p}>{p === 0 ? "Sem sinal (paga tudo na retirada)" : p === 100 ? "100% (paga tudo antes)" : `${p}% do valor`}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">
          {v.onlinePix
            ? "O cliente paga o sinal no Pix na hora de encomendar e a encomenda só chega para você depois do pagamento."
            : "Com o Pix online desligado, o cliente vê sua chave Pix para mandar o sinal e você marca \"Sinal recebido\" no pedido. Ligue o Pix online em Pagamentos para receber o sinal automaticamente."}
        </p>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Salvo.</p>}
      <button className="btn" disabled={pending}>{pending ? "Salvando..." : "Salvar regras"}</button>
    </form>
  );
}
