"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { saveProduct } from "@/app/painel/actions";
import { SIZE_PRESETS } from "@/lib/niche";
import { colorSwatch, compareSizes, splitList } from "@/lib/variants";
import { PhotoPicker } from "./PhotoPicker";
import { DURATION_OPTIONS, formatDuration } from "@/lib/booking";

export type EditableVariant = { id: string; color: string | null; size: string | null; stock: number | null; priceCents: number | null; active: boolean };
export type EditableProduct = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  compareAtCents: number | null;
  categoryId: string | null;
  imageUrl: string | null;
  images: string[];
  stock: number | null;
  variants: EditableVariant[];
  durationMinutes?: number | null;
};

type Cell = { id?: string; stock: string; price: string; active: boolean };

const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));
const keyOf = (color: string, size: string) => `${color.toLowerCase()}|${size.toLowerCase()}`;

/**
 * Cadastro e edição de produto. Na loja de roupas (variants=true) tem cores, tamanhos
 * e uma grade com o estoque de cada combinação; no delivery, só os campos básicos.
 */
export function ProductForm({
  categories,
  product,
  variants: withVariants = false,
  examplePrice = "Preço, ex.: 24,90",
  service = false,
  onSaved,
}: {
  categories: { id: string; name: string }[];
  product?: EditableProduct;
  variants?: boolean;
  examplePrice?: string;
  /** Serviço de agendamento (barbearia, salão): pede a duração em vez de estoque. */
  service?: boolean;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(saveProduct, undefined);
  const ref = useRef<HTMLFormElement>(null);

  const initialColors = useMemo(() => uniq(product?.variants.map((v) => v.color ?? "").filter(Boolean) ?? []), [product]);
  const initialSizes = useMemo(() => uniq(product?.variants.map((v) => v.size ?? "").filter(Boolean) ?? []), [product]);
  const [colorsText, setColorsText] = useState(initialColors.join(", "));
  const [sizes, setSizes] = useState<string[]>(initialSizes);
  const [customSize, setCustomSize] = useState("");
  const [cells, setCells] = useState<Record<string, Cell>>(() => {
    const out: Record<string, Cell> = {};
    for (const v of product?.variants ?? [])
      out[keyOf(v.color ?? "", v.size ?? "")] = { id: v.id, stock: v.stock === null ? "" : String(v.stock), price: money(v.priceCents), active: v.active };
    return out;
  });
  const [showPrices, setShowPrices] = useState(() => !!product?.variants.some((v) => v.priceCents !== null));
  const [fillAll, setFillAll] = useState("");
  const [photos, setPhotos] = useState<string[]>(() => [product?.imageUrl, ...(product?.images ?? [])].filter((u): u is string => !!u));

  const colors = splitList(colorsText);
  const sortedSizes = [...sizes].sort(compareSizes);
  const colorAxis = colors.length ? colors : [""];
  const sizeAxis = sortedSizes.length ? sortedSizes : [""];
  const hasGrid = withVariants && (colors.length > 0 || sizes.length > 0);
  const combos = hasGrid ? colorAxis.flatMap((c) => sizeAxis.map((s) => ({ color: c, size: s, key: keyOf(c, s) }))) : [];
  const cell = (k: string): Cell => cells[k] ?? { stock: "", price: "", active: true };
  const setCell = (k: string, patch: Partial<Cell>) => setCells((all) => ({ ...all, [k]: { ...cell(k), ...patch } }));
  const totalStock = combos.reduce((sum, c) => sum + (Number(cell(c.key).stock) || 0), 0);

  const variantsJson = JSON.stringify(
    combos.map((c) => ({ id: cell(c.key).id, color: c.color, size: c.size, stock: cell(c.key).stock, price: showPrices ? cell(c.key).price : "", active: cell(c.key).active })),
  );

  useEffect(() => {
    if (!state?.ok) return;
    if (!product) {
      ref.current?.reset();
      setColorsText("");
      setSizes([]);
      setCells({});
      setPhotos([]);
    }
    onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.savedAt]);

  const toggleSize = (s: string) => setSizes((all) => (all.some((x) => x.toLowerCase() === s.toLowerCase()) ? all.filter((x) => x.toLowerCase() !== s.toLowerCase()) : [...all, s]));

  return (
    <form ref={ref} action={action} className="space-y-3">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div>
        <label className="label" htmlFor="p-name">Nome</label>
        <input id="p-name" name="name" className="input" defaultValue={product?.name} required />
      </div>
      <div>
        <label className="label" htmlFor="p-desc">Descrição</label>
        <textarea id="p-desc" name="description" className="input" rows={2} defaultValue={product?.description ?? ""} placeholder={withVariants ? "Tecido, caimento, medidas..." : service ? "O que está incluso, ex.: lavagem e finalização" : "Ingredientes, tamanho, serve quantas pessoas..."} />
      </div>
      <div className={withVariants || service ? "grid grid-cols-2 gap-3" : ""}>
        <div>
          <label className="label" htmlFor="p-price">Preço (R$)</label>
          <input id="p-price" name="price" placeholder={examplePrice} className="input" inputMode="decimal" defaultValue={money(product?.priceCents ?? null)} required />
        </div>
        {service && (
          <div>
            <label className="label" htmlFor="p-duration">Tempo na agenda</label>
            <select id="p-duration" name="durationMinutes" className="input" defaultValue={product?.durationMinutes ?? 30}>
              {[...new Set([...DURATION_OPTIONS, product?.durationMinutes ?? 30])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
            </select>
          </div>
        )}
        {withVariants && (
          <div>
            <label className="label" htmlFor="p-compare">Preço &quot;de&quot; (opcional)</label>
            <input id="p-compare" name="compareAt" placeholder="Ex.: 159,90" className="input" inputMode="decimal" defaultValue={money(product?.compareAtCents ?? null)} />
          </div>
        )}
      </div>
      {withVariants && <p className="-mt-1 text-xs text-stone-500">Com preço &quot;de&quot;, o catálogo mostra o valor antigo riscado e o selo de promoção.</p>}
      <div>
        <label className="label" htmlFor="p-cat">Categoria</label>
        <select id="p-cat" name="categoryId" className="input" defaultValue={product?.categoryId ?? ""}>
          <option value="">Sem categoria</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <p className="label">{withVariants ? "Fotos (a primeira é a principal, até 9)" : "Foto"}</p>
        <PhotoPicker value={photos} onChange={setPhotos} max={withVariants ? 9 : 1} shape={withVariants ? "portrait" : "square"} />
        <input type="hidden" name="imageUrl" value={photos[0] ?? ""} />
        <input type="hidden" name="images" value={photos.slice(1).join("\n")} />
      </div>

      {withVariants && (
        <fieldset className="space-y-3 rounded-xl border border-stone-200 p-3">
          <legend className="px-1 text-sm font-semibold">Cores, tamanhos e estoque</legend>
          <div>
            <label className="label" htmlFor="p-colors">Cores (separe por vírgula)</label>
            <input id="p-colors" className="input" value={colorsText} onChange={(e) => setColorsText(e.target.value)} placeholder="Ex.: Preto, Off-white, Azul marinho" />
            {colors.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {colors.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                    <Swatch color={c} /> {c}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="label">Tamanhos</p>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_PRESETS.map((p) => (
                <button key={p.label} type="button" className="rounded-full border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-brand-500 hover:text-brand-700" onClick={() => setSizes(p.sizes)}>
                  {p.label}
                </button>
              ))}
              {sizes.length > 0 && (
                <button type="button" className="rounded-full px-2 py-1 text-xs text-stone-500 underline" onClick={() => setSizes([])}>limpar</button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {sortedSizes.map((s) => (
                <button key={s} type="button" onClick={() => toggleSize(s)} className="rounded-lg bg-brand-600 px-2.5 py-1 text-sm font-semibold text-white" title="Tirar este tamanho">
                  {s} <span className="opacity-70">×</span>
                </button>
              ))}
              <input
                className="input w-24! py-1! text-sm"
                placeholder="+ tamanho"
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = customSize.trim().slice(0, 12);
                    if (v && !sizes.some((x) => x.toLowerCase() === v.toLowerCase())) setSizes([...sizes, v]);
                    setCustomSize("");
                  }
                }}
              />
            </div>
          </div>

          {hasGrid ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                <span>Estoque de cada combinação ({combos.length}). Vazio = não controla.</span>
                <span className="ml-auto flex items-center gap-1">
                  <input className="input w-16! py-1! text-xs" inputMode="numeric" placeholder="qtd" value={fillAll} onChange={(e) => setFillAll(e.target.value.replace(/\D/g, ""))} />
                  <button type="button" className="btn-ghost px-2! py-1! text-xs" onClick={() => combos.forEach((c) => setCell(c.key, { stock: fillAll }))}>
                    Preencher todos
                  </button>
                </span>
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border border-stone-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-stone-50 text-left text-xs text-stone-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Variação</th>
                      <th className="px-2 py-1.5 font-medium">Estoque</th>
                      {showPrices && <th className="px-2 py-1.5 font-medium">Preço</th>}
                      <th className="px-2 py-1.5 font-medium">À venda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {combos.map((c) => {
                      const v = cell(c.key);
                      return (
                        <tr key={c.key} className={v.active ? "" : "text-stone-400"}>
                          <td className="px-2 py-1">
                            <span className="inline-flex items-center gap-1.5">
                              {c.color && <Swatch color={c.color} />}
                              {[c.color, c.size].filter(Boolean).join(" · ")}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              aria-label={`Estoque ${c.color} ${c.size}`}
                              className={`input w-20! py-1! ${v.stock === "0" ? "border-red-300 bg-red-50" : ""}`}
                              inputMode="numeric"
                              value={v.stock}
                              onChange={(e) => setCell(c.key, { stock: e.target.value.replace(/\D/g, "") })}
                            />
                          </td>
                          {showPrices && (
                            <td className="px-2 py-1">
                              <input className="input w-24! py-1!" inputMode="decimal" placeholder="igual" value={v.price} onChange={(e) => setCell(c.key, { price: e.target.value })} />
                            </td>
                          )}
                          <td className="px-2 py-1">
                            <input type="checkbox" checked={v.active} onChange={(e) => setCell(c.key, { active: e.target.checked })} aria-label="À venda" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-stone-600">Total em estoque: <strong>{totalStock}</strong> peças</span>
                <label className="flex items-center gap-1.5 text-stone-600">
                  <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} /> Preço diferente por tamanho
                </label>
              </div>
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="p-stock">Estoque (sem cor/tamanho)</label>
              <input id="p-stock" name="stock" className="input w-32!" inputMode="numeric" placeholder="Não controla" defaultValue={product?.stock ?? ""} />
              <p className="mt-1 text-xs text-stone-500">Informe cores ou tamanhos acima para ter estoque por combinação. Deixe vazio para não controlar.</p>
            </div>
          )}
          <input type="hidden" name="variants" value={variantsJson} />
        </fieldset>
      )}

      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && product && <p className="text-sm text-green-700">Salvo.</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Salvando..." : product ? "Salvar alterações" : service ? "Adicionar serviço" : "Adicionar produto"}</button>
    </form>
  );
}

function uniq(list: string[]) {
  const out: string[] = [];
  for (const v of list) if (!out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  return out;
}

export function Swatch({ color }: { color: string }) {
  const hex = colorSwatch(color);
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 flex-none rounded-full ring-1 ring-stone-900/15"
      style={hex ? { background: hex } : { background: "conic-gradient(#f472b6,#facc15,#4ade80,#60a5fa,#f472b6)" }}
    />
  );
}
