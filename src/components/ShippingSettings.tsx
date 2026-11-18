"use client";

import { useActionState, useEffect, useState } from "react";
import { saveShippingSettings } from "@/app/painel/actions";
import { UFS } from "@/lib/shipping";

type MethodRow = {
  id?: string; name: string; active: boolean;
  sameState: string; southeast: string; south: string; midwest: string; northeast: string; north: string;
  daysMin: string; daysMax: string;
};
type Initial = { acceptsShipping: boolean; originUf: string; freeAbove: string; methods: MethodRow[] };

const PRICE_COLS: { key: keyof MethodRow; label: string }[] = [
  { key: "sameState", label: "Mesmo estado" },
  { key: "southeast", label: "Sudeste" },
  { key: "south", label: "Sul" },
  { key: "midwest", label: "Centro-Oeste" },
  { key: "northeast", label: "Nordeste" },
  { key: "north", label: "Norte" },
];

const blank = (name = ""): MethodRow => ({ name, active: true, sameState: "", southeast: "", south: "", midwest: "", northeast: "", north: "", daysMin: "", daysMax: "" });

/** Tabela de frete da loja: liga o envio, estado de origem, frete grátis e as formas de envio. */
export function ShippingSettings({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState(saveShippingSettings, undefined);
  const [on, setOn] = useState(initial.acceptsShipping);
  const [methods, setMethods] = useState<MethodRow[]>(initial.methods);
  useEffect(() => {
    // Formas de envio vazias são ignoradas no servidor; aqui também, para os ids baterem.
    if (!state?.ids) return;
    const filled = methods.filter((m) => m.name.trim() || PRICE_COLS.some((c) => (m[c.key] as string).trim()));
    if (filled.length === state.ids.length) setMethods(filled.map((m, i) => ({ ...m, id: state.ids![i] })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.savedAt]);
  const set = (i: number, patch: Partial<MethodRow>) => setMethods((all) => all.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <form action={action} className="space-y-4">
      <div className="card space-y-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="acceptsShipping" checked={on} onChange={(e) => setOn(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-medium">Enviar pedidos pelos Correios ou transportadora</span>
            <span className="block text-sm text-stone-500">Aparece a opção &quot;Envio&quot; na sacola, com CEP e frete calculado pela sua tabela.</span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="originUf">Você envia de qual estado?</label>
            <select id="originUf" name="originUf" className="input" defaultValue={initial.originUf}>
              <option value="">Escolha</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
            <p className="mt-1 text-xs text-stone-500">Para usar o preço &quot;mesmo estado&quot;.</p>
          </div>
          <div>
            <label className="label" htmlFor="freeAbove">Frete grátis a partir de (R$)</label>
            <input id="freeAbove" name="freeAbove" className="input" inputMode="decimal" placeholder="Ex.: 299,00 (opcional)" defaultValue={initial.freeAbove} />
            <p className="mt-1 text-xs text-stone-500">Vale para a forma de envio mais barata.</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Formas de envio e preços</h2>
            <p className="text-sm text-stone-500">Deixe vazio onde você não envia. O prazo é contado depois da postagem.</p>
          </div>
        </div>
        {methods.length === 0 && (
          <div className="card space-y-3 text-sm text-stone-600">
            <p>Comece pelas formas mais usadas. Depois é só colocar os seus preços.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => setMethods([{ ...blank("PAC"), daysMin: "4", daysMax: "10" }, { ...blank("SEDEX"), daysMin: "1", daysMax: "4" }])}>
                Começar com PAC e SEDEX
              </button>
              <button type="button" className="btn-ghost" onClick={() => setMethods([blank()])}>Criar do zero</button>
            </div>
          </div>
        )}
        {methods.map((m, i) => (
          <fieldset key={m.id ?? `novo${i}`} className={`card space-y-3 ${m.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-end gap-2">
              <div className="basis-full sm:min-w-[160px] sm:flex-1 sm:basis-auto">
                <label className="label">Nome</label>
                <input className="input" value={m.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Ex.: PAC, SEDEX, Jadlog" />
              </div>
              <div className="w-20">
                <label className="label">Prazo de</label>
                <input className="input" inputMode="numeric" value={m.daysMin} onChange={(e) => set(i, { daysMin: e.target.value.replace(/\D/g, "") })} placeholder="dias" />
              </div>
              <div className="w-20">
                <label className="label">até</label>
                <input className="input" inputMode="numeric" value={m.daysMax} onChange={(e) => set(i, { daysMax: e.target.value.replace(/\D/g, "") })} placeholder="dias" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRICE_COLS.map((c) => (
                <div key={c.key}>
                  <label className="text-xs font-medium text-stone-600">{c.label}</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-stone-400">R$</span>
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder="não envia"
                      value={m[c.key] as string}
                      onChange={(e) => set(i, { [c.key]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={m.active} onChange={(e) => set(i, { active: e.target.checked })} /> Ligada
              </label>
              <span className="flex gap-3">
                <button type="button" className="text-stone-600 underline" onClick={() => {
                  const fill = m.southeast || m.sameState;
                  if (fill) set(i, { southeast: m.southeast || fill, south: m.south || fill, midwest: m.midwest || fill, northeast: m.northeast || fill, north: m.north || fill });
                }}>Mesmo preço para o Brasil todo</button>
                <button type="button" className="text-red-600 underline" onClick={() => setMethods((all) => all.filter((_, j) => j !== i))}>Remover</button>
              </span>
            </div>
          </fieldset>
        ))}
        {methods.length > 0 && methods.length < 6 && (
          <button type="button" className="btn-ghost" onClick={() => setMethods((all) => [...all, blank()])}>+ Outra forma de envio</button>
        )}
        <p className="text-xs text-stone-500">
          Dica: simule no site dos Correios (Preços e prazos) um pacote do tamanho que você costuma mandar, saindo da sua cidade para uma capital de cada região, e use esses valores.
        </p>
      </div>

      <input type="hidden" name="methods" value={JSON.stringify(methods)} />
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Envios salvos.</p>}
      <button className="btn" disabled={pending}>{pending ? "Salvando..." : "Salvar envios"}</button>
    </form>
  );
}
