// Cores, tamanhos e estoque das variações. Sem dependência de banco, para poder testar.

import { parseBRLToCents } from "./money";

export type VariantInput = { id?: string; color?: string; size?: string; stock?: string; price?: string; active?: boolean };
export type VariantRow = { id?: string; color: string | null; size: string | null; stock: number | null; priceCents: number | null; active: boolean; position: number };

const MAX_VARIANTS = 120;

const clean = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;

/** Valida as linhas da grade vindas do formulário do produto. Estoque vazio = não controla. */
export function parseVariantRows(raw: string): { ok: true; rows: VariantRow[] } | { ok: false; error: string } {
  let input: unknown;
  try {
    input = JSON.parse(raw || "[]");
  } catch {
    return { ok: false, error: "Grade de cores e tamanhos inválida." };
  }
  if (!Array.isArray(input)) return { ok: false, error: "Grade de cores e tamanhos inválida." };
  if (input.length > MAX_VARIANTS) return { ok: false, error: `Até ${MAX_VARIANTS} combinações de cor e tamanho por produto.` };
  const rows: VariantRow[] = [];
  const seen = new Set<string>();
  for (const [i, item] of (input as VariantInput[]).entries()) {
    const color = clean(item.color, 30);
    const size = clean(item.size, 12);
    if (!color && !size) continue;
    const key = `${color?.toLowerCase()}|${size?.toLowerCase()}`;
    if (seen.has(key)) return { ok: false, error: `A combinação ${[color, size].filter(Boolean).join(" · ")} aparece duas vezes.` };
    seen.add(key);
    let stock: number | null = null;
    const stockRaw = (item.stock ?? "").trim();
    if (stockRaw) {
      stock = Number(stockRaw);
      if (!Number.isInteger(stock) || stock < 0 || stock > 99999)
        return { ok: false, error: `Estoque inválido em ${[color, size].filter(Boolean).join(" · ")}. Use um número inteiro.` };
    }
    let priceCents: number | null = null;
    if ((item.price ?? "").trim()) {
      priceCents = parseBRLToCents(item.price!);
      if (priceCents === null || priceCents === 0) return { ok: false, error: `Preço inválido em ${[color, size].filter(Boolean).join(" · ")}.` };
    }
    rows.push({ id: typeof item.id === "string" ? item.id : undefined, color, size, stock, priceCents, active: item.active !== false, position: i });
  }
  return { ok: true, rows };
}

/** Lista separada por vírgula ou linha, sem repetidos: "Azul, Rosa" → ["Azul", "Rosa"]. */
export function splitList(raw: string, max = 20) {
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const v = part.replace(/\s+/g, " ").trim();
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, max);
}

/** Ordem natural de tamanhos: PP, P, M, G, GG, XG... e números em ordem crescente. */
const LETTER_ORDER = ["RN", "PP", "P", "M", "G", "GG", "XG", "XGG", "EXG", "G1", "G2", "G3", "U", "ÚNICO"];
export function compareSizes(a: string, b: string) {
  const na = Number(a.replace(",", "."));
  const nb = Number(b.replace(",", "."));
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  const ia = LETTER_ORDER.indexOf(a.toUpperCase());
  const ib = LETTER_ORDER.indexOf(b.toUpperCase());
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, "pt-BR");
}

const COLORS: Record<string, string> = {
  preto: "#1c1917", preta: "#1c1917", branco: "#ffffff", branca: "#ffffff", "off-white": "#f5f0e6", offwhite: "#f5f0e6",
  cinza: "#9ca3af", chumbo: "#4b5563", grafite: "#374151", mescla: "#a8a29e",
  azul: "#2563eb", "azul marinho": "#1e3a8a", marinho: "#1e3a8a", "azul claro": "#93c5fd", "azul bebê": "#bfdbfe", jeans: "#3b5b8c",
  "jeans claro": "#7d9cc4", "jeans escuro": "#24375a", turquesa: "#14b8a6", "verde água": "#5eead4",
  verde: "#16a34a", "verde militar": "#4d5d33", oliva: "#6b7a3a", "verde musgo": "#4d5d33", "verde bandeira": "#15803d",
  amarelo: "#facc15", mostarda: "#ca8a04", laranja: "#f97316", terracota: "#c2410c", caramelo: "#b45309", ferrugem: "#9a3412",
  vermelho: "#dc2626", vinho: "#7f1d1d", bordô: "#7f1d1d", bordo: "#7f1d1d", marsala: "#8b2e3c",
  rosa: "#f472b6", "rosa claro": "#fbcfe8", "rosa bebê": "#fbcfe8", pink: "#ec4899", fúcsia: "#c026d3", fucsia: "#c026d3", coral: "#fb7185",
  lilás: "#c4b5fd", lilas: "#c4b5fd", roxo: "#7e22ce", lavanda: "#ddd6fe",
  bege: "#e7d8c0", nude: "#e8c4a8", areia: "#d6c4a1", creme: "#f3ead3", cru: "#efe6d2", camel: "#c19a6b",
  marrom: "#78350f", café: "#5b3a29", cafe: "#5b3a29", chocolate: "#4a2c1d", dourado: "#d4a72c", prata: "#c0c0c0",
};

/** Cor aproximada para a bolinha da cor (null = não conhecida, mostra só o nome). */
export function colorSwatch(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(key)) return key;
  if (COLORS[key]) return COLORS[key];
  // "Azul royal" → tenta a primeira palavra.
  return COLORS[key.split(/\s+/)[0]] ?? null;
}
