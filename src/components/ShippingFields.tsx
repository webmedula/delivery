"use client";

import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/money";
import { cepToUf, formatDays, shippingOptions, type ShippingMethodRow, type ShippingOption } from "@/lib/shipping";

export type ShippingConfig = { methods: ShippingMethodRow[]; originUf: string | null; freeAboveCents: number | null };
export type ShippingForm = { cep: string; street: string; number: string; complement: string; district: string; city: string; methodId: string };

export const emptyShipping: ShippingForm = { cep: "", street: "", number: "", complement: "", district: "", city: "", methodId: "" };

/** Opções e frete escolhido para o CEP digitado (o servidor recalcula ao fazer o pedido). */
export function quoteShippingForm(config: ShippingConfig | null | undefined, form: ShippingForm, subtotalCents: number) {
  if (!config || form.cep.replace(/\D/g, "").length !== 8) return { options: [] as ShippingOption[], error: null, selected: undefined };
  const r = shippingOptions(config.methods, { originUf: config.originUf, freeAboveCents: config.freeAboveCents }, form.cep, subtotalCents);
  if (!r.ok) return { options: [] as ShippingOption[], error: r.error, selected: undefined };
  return { options: r.options, error: null, selected: r.options.find((o) => o.id === form.methodId) };
}

/**
 * Endereço de envio com CEP: ao digitar o CEP, rua, bairro e cidade vêm do ViaCEP
 * (se a consulta falhar, a pessoa digita). O estado sai do próprio CEP.
 */
export function ShippingFields({
  config,
  value,
  onChange,
  subtotalCents,
}: {
  config: ShippingConfig;
  value: ShippingForm;
  onChange: (v: ShippingForm) => void;
  subtotalCents: number;
}) {
  const [looking, setLooking] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const numberRef = useRef<HTMLInputElement>(null);
  const latest = useRef(value);
  latest.current = value;
  const set = (patch: Partial<ShippingForm>) => onChange({ ...latest.current, ...patch });
  const digits = value.cep.replace(/\D/g, "");
  const uf = cepToUf(digits);
  const { options, error } = quoteShippingForm(config, value, subtotalCents);

  // Escolhe sozinho a opção mais barata quando o CEP muda ou a escolhida some.
  useEffect(() => {
    if (options.length && !options.some((o) => o.id === value.methodId)) set({ methodId: options[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.map((o) => o.id).join(","), value.methodId]);

  useEffect(() => {
    if (digits.length !== 8 || !uf) return;
    let alive = true;
    setLooking(true);
    setLookupFailed(false);
    fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(6000) })
      .then((r) => r.json())
      .then((d: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string }) => {
        if (!alive) return;
        if (d.erro) return setLookupFailed(true);
        set({ street: d.logradouro || latest.current.street, district: d.bairro || latest.current.district, city: d.localidade || latest.current.city });
        if (d.logradouro) numberRef.current?.focus();
      })
      .catch(() => alive && setLookupFailed(true))
      .finally(() => alive && setLooking(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const freeMissing = config.freeAboveCents && subtotalCents < config.freeAboveCents ? config.freeAboveCents - subtotalCents : 0;

  return (
    <fieldset className="space-y-2">
      <legend className="label">Endereço de envio</legend>
      <div className="flex items-center gap-2">
        <input
          className="input w-40"
          placeholder="CEP"
          inputMode="numeric"
          autoComplete="postal-code"
          value={value.cep}
          onChange={(e) => set({ cep: maskCep(e.target.value) })}
          required
        />
        {looking && <span className="text-xs text-stone-500">Buscando endereço...</span>}
        {uf && !looking && <span className="min-w-0 truncate text-sm font-medium text-stone-600">{value.city ? `${value.city}/${uf}` : uf}</span>}
      </div>
      {!uf && (
        <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener" className="inline-block text-xs text-stone-500 underline">
          Não sei meu CEP
        </a>
      )}
      {digits.length === 8 && !uf && <p className="text-sm text-red-600">CEP inválido. Confira os 8 números.</p>}
      {lookupFailed && <p className="text-xs text-stone-500">Não achamos o endereço deste CEP. Preencha abaixo.</p>}
      {uf && (
        <>
          <input className="input" placeholder="Rua" autoComplete="address-line1" value={value.street} onChange={(e) => set({ street: e.target.value })} required />
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <input ref={numberRef} className="input" placeholder="Número" value={value.number} onChange={(e) => set({ number: e.target.value })} required />
            <input className="input" placeholder="Complemento (opcional)" autoComplete="address-line2" value={value.complement} onChange={(e) => set({ complement: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Bairro" value={value.district} onChange={(e) => set({ district: e.target.value })} required />
            <input className="input" placeholder="Cidade" autoComplete="address-level2" value={value.city} onChange={(e) => set({ city: e.target.value })} required />
          </div>
        </>
      )}
      {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>}
      {options.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="label">Forma de envio</p>
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 rounded-lg border border-stone-200 p-2.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" name="shippingMethod" checked={value.methodId === o.id} onChange={() => set({ methodId: o.id })} />
              <span className="flex-1">
                <span className="font-medium">{o.name}</span>
                {formatDays(o.daysMin, o.daysMax) && <span className="block text-xs text-stone-500">{formatDays(o.daysMin, o.daysMax)} após o envio</span>}
              </span>
              <span className="text-right tabular-nums">
                {o.free ? (
                  <>
                    <s className="block text-xs text-stone-400">{formatBRL(o.tableCents)}</s>
                    <b className="text-green-700">Grátis</b>
                  </>
                ) : (
                  formatBRL(o.feeCents)
                )}
              </span>
            </label>
          ))}
          {freeMissing > 0 && <p className="text-xs text-stone-500">Faltam {formatBRL(freeMissing)} para o frete grátis.</p>}
        </div>
      )}
    </fieldset>
  );
}

function maskCep(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
