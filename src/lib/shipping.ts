// Frete de envio (Correios ou transportadora) pela tabela da loja: preço por destino
// (mesmo estado ou região do país) e frete grátis acima de um valor.
// O estado vem do CEP pelas faixas oficiais dos Correios, sem consultar nada na internet,
// para o servidor sempre conseguir conferir o preço. Sem dependência de banco, para poder testar.

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
export type UF = (typeof UFS)[number];

export type Region = "southeast" | "south" | "midwest" | "northeast" | "north";

export const REGIONS: { key: Region; label: string; ufs: UF[] }[] = [
  { key: "southeast", label: "Sudeste", ufs: ["ES", "MG", "RJ", "SP"] },
  { key: "south", label: "Sul", ufs: ["PR", "RS", "SC"] },
  { key: "midwest", label: "Centro-Oeste", ufs: ["DF", "GO", "MS", "MT"] },
  { key: "northeast", label: "Nordeste", ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
  { key: "north", label: "Norte", ufs: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"] },
];

// Faixas de CEP por estado (5 primeiros dígitos), dos Correios.
const CEP_RANGES: [number, number, UF][] = [
  [1000, 19999, "SP"], [20000, 28999, "RJ"], [29000, 29999, "ES"], [30000, 39999, "MG"],
  [40000, 48999, "BA"], [49000, 49999, "SE"], [50000, 56999, "PE"], [57000, 57999, "AL"],
  [58000, 58999, "PB"], [59000, 59999, "RN"], [60000, 63999, "CE"], [64000, 64999, "PI"],
  [65000, 65999, "MA"], [66000, 68899, "PA"], [68900, 68999, "AP"], [69000, 69299, "AM"],
  [69300, 69399, "RR"], [69400, 69899, "AM"], [69900, 69999, "AC"], [70000, 72799, "DF"],
  [72800, 72999, "GO"], [73000, 73699, "DF"], [73700, 76799, "GO"], [76800, 76999, "RO"],
  [77000, 77999, "TO"], [78000, 78999, "MT"], [79000, 79999, "MS"], [80000, 87999, "PR"],
  [88000, 89999, "SC"], [90000, 99999, "RS"],
];

export function normalizeCep(raw: string | null | undefined) {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 8 ? d : null;
}

export function formatCep(cep: string) {
  return cep.replace(/^(\d{5})(\d{3})$/, "$1-$2");
}

/** Estado do CEP, ou null se o CEP não existe. */
export function cepToUf(raw: string | null | undefined): UF | null {
  const cep = normalizeCep(raw);
  if (!cep) return null;
  const prefix = Number(cep.slice(0, 5));
  return CEP_RANGES.find(([a, b]) => prefix >= a && prefix <= b)?.[2] ?? null;
}

export function isUf(v: string | null | undefined): v is UF {
  return !!v && (UFS as readonly string[]).includes(v);
}

export function regionOf(uf: UF): Region {
  return REGIONS.find((r) => r.ufs.includes(uf))!.key;
}

export type ShippingMethodRow = {
  id: string;
  name: string;
  sameStateCents: number | null;
  southeastCents: number | null;
  southCents: number | null;
  midwestCents: number | null;
  northeastCents: number | null;
  northCents: number | null;
  daysMin: number | null;
  daysMax: number | null;
  active: boolean;
};

export type ShippingRules = { originUf: string | null; freeAboveCents: number | null };

export type ShippingOption = {
  id: string;
  name: string;
  feeCents: number;
  /** Preço da tabela, antes do frete grátis. */
  tableCents: number;
  free: boolean;
  daysMin: number | null;
  daysMax: number | null;
};

const REGION_FIELD: Record<Region, keyof ShippingMethodRow> = {
  southeast: "southeastCents",
  south: "southCents",
  midwest: "midwestCents",
  northeast: "northeastCents",
  north: "northCents",
};

/** Preço de uma forma de envio para o estado (null = não envia para lá). */
export function priceFor(m: ShippingMethodRow, uf: UF, originUf: string | null): number | null {
  if (originUf === uf && m.sameStateCents !== null) return m.sameStateCents;
  return m[REGION_FIELD[regionOf(uf)]] as number | null;
}

/**
 * Opções de envio para o CEP, da mais barata para a mais cara. O frete grátis
 * (subtotal a partir do valor da loja) vale para a opção mais barata.
 */
export function shippingOptions(
  methods: ShippingMethodRow[],
  rules: ShippingRules,
  cepRaw: string,
  subtotalCents: number,
): { ok: true; uf: UF; options: ShippingOption[] } | { ok: false; error: string } {
  const uf = cepToUf(cepRaw);
  if (!uf) return { ok: false, error: "CEP inválido. Confira os 8 números." };
  const options: ShippingOption[] = [];
  for (const m of methods) {
    if (!m.active) continue;
    const price = priceFor(m, uf, rules.originUf);
    if (price === null) continue;
    options.push({ id: m.id, name: m.name, feeCents: price, tableCents: price, free: false, daysMin: m.daysMin, daysMax: m.daysMax });
  }
  if (options.length === 0) return { ok: false, error: `A loja ainda não envia para ${uf}. Fale com a loja pelo WhatsApp.` };
  options.sort((a, b) => a.feeCents - b.feeCents || (a.daysMax ?? 99) - (b.daysMax ?? 99));
  if (rules.freeAboveCents && subtotalCents >= rules.freeAboveCents) {
    options[0] = { ...options[0], feeCents: 0, free: true };
  }
  return { ok: true, uf, options };
}

/** A opção escolhida pelo cliente, recalculada no servidor. */
export function resolveShipping(
  methods: ShippingMethodRow[],
  rules: ShippingRules,
  cepRaw: string,
  methodId: string | undefined,
  subtotalCents: number,
): { ok: true; uf: UF; option: ShippingOption } | { ok: false; error: string } {
  const res = shippingOptions(methods, rules, cepRaw, subtotalCents);
  if (!res.ok) return res;
  const option = res.options.find((o) => o.id === methodId);
  if (!option) return { ok: false, error: "Escolha a forma de envio." };
  return { ok: true, uf: res.uf, option };
}

/** "3 a 7 dias úteis", "5 dias úteis" ou "". */
export function formatDays(min: number | null, max: number | null) {
  if (!min && !max) return "";
  const a = min ?? max!;
  const b = max ?? min!;
  return b > a ? `${a} a ${b} dias úteis` : `${a} ${a === 1 ? "dia útil" : "dias úteis"}`;
}

export type ShippingAddress = {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  uf: string;
};

/** "Rua X, 123, apto 4 - Centro, Campinas/SP - CEP 13010-000" */
export function formatShippingAddress(a: ShippingAddress) {
  const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const line1 = [clean(a.street), clean(a.number), clean(a.complement)].filter(Boolean).join(", ");
  return `${line1} - ${clean(a.district)}, ${clean(a.city)}/${a.uf} - CEP ${formatCep(a.cep)}`;
}

/** Código de rastreio dos Correios: duas letras, 9 números e BR. */
export function isCorreiosCode(code: string | null | undefined) {
  return !!code && /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(code);
}

export function normalizeTrackingCode(raw: string | null | undefined) {
  const code = (raw ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 40);
  return code || null;
}

export const CORREIOS_TRACKING_URL = "https://rastreamento.correios.com.br/app/index.php";

// --- Cadastro das formas de envio no painel ---

export type ShippingMethodInput = {
  id?: string; name?: string; sameState?: string; southeast?: string; south?: string; midwest?: string; northeast?: string; north?: string;
  daysMin?: string; daysMax?: string; active?: boolean;
};

const MAX_METHODS = 6;
const PRICE_FIELDS = [
  ["sameState", "sameStateCents", "mesmo estado"],
  ["southeast", "southeastCents", "Sudeste"],
  ["south", "southCents", "Sul"],
  ["midwest", "midwestCents", "Centro-Oeste"],
  ["northeast", "northeastCents", "Nordeste"],
  ["north", "northCents", "Norte"],
] as const;

export type ParsedShippingMethod = Omit<ShippingMethodRow, "id"> & { id?: string; position: number };

/** Valida as formas de envio vindas do formulário. Preço vazio = não envia para lá. */
export function parseShippingMethods(raw: string, parseMoney: (s: string) => number | null): { ok: true; methods: ParsedShippingMethod[] } | { ok: false; error: string } {
  let input: unknown;
  try {
    input = JSON.parse(raw || "[]");
  } catch {
    return { ok: false, error: "Formas de envio inválidas." };
  }
  if (!Array.isArray(input)) return { ok: false, error: "Formas de envio inválidas." };
  const rows = (input as ShippingMethodInput[]).filter((m) => (m.name ?? "").trim() || PRICE_FIELDS.some(([k]) => (m[k] ?? "").trim()));
  if (rows.length > MAX_METHODS) return { ok: false, error: `Até ${MAX_METHODS} formas de envio.` };
  const methods: ParsedShippingMethod[] = [];
  for (const [i, m] of rows.entries()) {
    const name = (m.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (name.length < 2) return { ok: false, error: "Dê um nome para cada forma de envio (ex.: PAC, SEDEX)." };
    const out: ParsedShippingMethod = {
      id: typeof m.id === "string" ? m.id : undefined, name, position: i, active: m.active !== false,
      sameStateCents: null, southeastCents: null, southCents: null, midwestCents: null, northeastCents: null, northCents: null,
      daysMin: null, daysMax: null,
    };
    for (const [field, key, label] of PRICE_FIELDS) {
      const v = (m[field] ?? "").trim();
      if (!v) continue;
      const cents = parseMoney(v);
      if (cents === null || cents > 100000) return { ok: false, error: `Preço inválido em ${name} (${label}).` };
      out[key] = cents;
    }
    if (PRICE_FIELDS.every(([, key]) => out[key] === null)) return { ok: false, error: `Informe pelo menos um preço em ${name}.` };
    const day = (s: string | undefined) => (s ?? "").trim() ? Number(s) : null;
    const dMin = day(m.daysMin);
    const dMax = day(m.daysMax);
    const okDay = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= 90);
    if (!okDay(dMin) || !okDay(dMax)) return { ok: false, error: `Prazo inválido em ${name}. Use dias inteiros, de 1 a 90.` };
    if (dMin !== null && dMax !== null && dMax < dMin) return { ok: false, error: `Em ${name}, o prazo máximo não pode ser menor que o mínimo.` };
    out.daysMin = dMin ?? dMax;
    out.daysMax = dMax ?? dMin;
    methods.push(out);
  }
  return { ok: true, methods };
}
