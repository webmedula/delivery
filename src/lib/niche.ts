// Tipo de negócio da loja (nicho). Um sistema só: o tipo decide os textos e quais
// módulos aparecem no painel e no catálogo. Sem dependência de banco, para poder testar.

import type { BusinessType, OrderStatus } from "@prisma/client";

export type NicheInfo = {
  value: BusinessType;
  /** Valor do ?tipo= no link do cadastro (vem das páginas de venda). */
  param: string;
  title: string;
  examples: string;
};

export const NICHES: NicheInfo[] = [
  { value: "FOOD", param: "delivery", title: "Restaurante e delivery", examples: "Lanchonete, pizzaria, açaí, marmitas" },
  { value: "RETAIL", param: "loja", title: "Loja de roupas e acessórios", examples: "Moda, calçados, bolsas, bijuterias" },
  { value: "PREORDER", param: "encomendas", title: "Encomendas", examples: "Bolos, doces, salgados para festa, marmitas da semana" },
];

/** Próximos nichos, mostrados como "em breve" no cadastro. */
export const UPCOMING_NICHES = [
  { title: "Barbearia e salão", examples: "Agendamento de horários" },
];

export function nicheFromParam(param: string | null | undefined): BusinessType | null {
  return NICHES.find((n) => n.param === param || n.value === param)?.value ?? null;
}

export function isBusinessType(v: string): v is BusinessType {
  return NICHES.some((n) => n.value === v);
}

type StoreForModules = { businessType: BusinessType; acceptsDelivery: boolean; acceptsShipping?: boolean };

/** Módulos ligados para a loja. O painel e o catálogo perguntam aqui, em vez de testar o tipo. */
export function modulesFor(store: StoreForModules) {
  const retail = store.businessType === "RETAIL";
  const preorder = store.businessType === "PREORDER";
  return {
    /** Encomendas com dia e horário marcados, antecedência mínima e sinal. */
    preorder,
    /** Entregadores e bairros: só para quem entrega. */
    couriers: store.acceptsDelivery,
    deliveryZones: store.acceptsDelivery,
    /** Tempo estimado de preparo/entrega mostrado ao cliente. */
    eta: !retail && !preorder,
    /** Cor e tamanho com estoque por variação. */
    variants: retail,
    /** Tela de estoque no painel. */
    stock: retail,
    /** Catálogo em grade com fotos grandes (vitrine), em vez da lista do cardápio. */
    gridCatalog: retail,
    /** Envio pelos Correios/transportadora com tabela de frete. */
    shipping: retail || !!store.acceptsShipping,
  };
}

export type Terms = {
  catalog: string; // "Cardápio" | "Catálogo"
  catalogLower: string;
  preparing: string; // etapa do pedido
  acceptAction: string;
  startAction: string;
  preparingMessage: string; // "foi aceito e já está em preparo"
  emptyCatalog: string;
  categoryPlaceholder: string;
  productExample: string;
  poweredBy: string;
};

const TERMS: Record<BusinessType, Terms> = {
  FOOD: {
    catalog: "Cardápio",
    catalogLower: "cardápio",
    preparing: "Em preparo",
    acceptAction: "Aceitar e preparar",
    startAction: "Começar preparo",
    preparingMessage: "foi aceito e já está em preparo",
    emptyCatalog: "O cardápio ainda está sendo montado.",
    categoryPlaceholder: "Ex.: Lanches",
    productExample: "Preço, ex.: 24,90",
    poweredBy: "Cardápio digital por",
  },
  RETAIL: {
    catalog: "Catálogo",
    catalogLower: "catálogo",
    preparing: "Separando",
    acceptAction: "Aceitar e separar",
    startAction: "Começar a separar",
    preparingMessage: "foi confirmado e já estamos separando as peças",
    emptyCatalog: "O catálogo ainda está sendo montado.",
    categoryPlaceholder: "Ex.: Vestidos",
    productExample: "Preço, ex.: 129,90",
    poweredBy: "Catálogo online por",
  },
  PREORDER: {
    catalog: "Cardápio",
    catalogLower: "cardápio",
    preparing: "Em produção",
    acceptAction: "Confirmar encomenda",
    startAction: "Começar produção",
    preparingMessage: "está confirmada",
    emptyCatalog: "O cardápio de encomendas ainda está sendo montado.",
    categoryPlaceholder: "Ex.: Bolos",
    productExample: "Preço, ex.: 120,00",
    poweredBy: "Encomendas online por",
  },
};

export function termsFor(type: BusinessType = "FOOD"): Terms {
  return TERMS[type] ?? TERMS.FOOD;
}

const BASE_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Recebido",
  CONFIRMED: "Confirmado",
  PREPARING: "Em preparo",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  READY_FOR_PICKUP: "Pronto para retirar",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
};

export function orderStatusLabelsFor(type: BusinessType = "FOOD"): Record<OrderStatus, string> {
  // Encomenda é palavra feminina.
  if (type === "PREORDER")
    return {
      PENDING: "Recebida", CONFIRMED: "Confirmada", PREPARING: "Em produção", OUT_FOR_DELIVERY: "Saiu para entrega",
      READY_FOR_PICKUP: "Pronta para retirar", COMPLETED: "Concluída", CANCELED: "Cancelada",
    };
  return { ...BASE_STATUS_LABEL, PREPARING: termsFor(type).preparing };
}

/** Nome da etapa considerando como o pedido chega ("Enviado" no lugar de "Saiu para entrega" no envio). */
export function orderStatusText(status: OrderStatus, fulfillment: string, type: BusinessType = "FOOD") {
  if (fulfillment === "SHIPPING" && status === "OUT_FOR_DELIVERY") return "Enviado";
  if (fulfillment === "SHIPPING" && status === "COMPLETED") return "Entregue";
  return orderStatusLabelsFor(type)[status];
}

/** Como a loja nasce no cadastro, conforme o tipo. */
export function signupDefaultsFor(type: BusinessType) {
  if (type === "RETAIL")
    return {
      store: { businessType: type, acceptsDelivery: false, acceptsPickup: true, whatsappCheckout: true },
      categories: ["Novidades", "Vestidos", "Blusas", "Calças e saias", "Acessórios"],
    };
  if (type === "PREORDER")
    return {
      store: { businessType: type, acceptsDelivery: false, acceptsPickup: true, preorderMinHours: 48, depositPercent: 50 },
      categories: ["Bolos", "Doces", "Salgados", "Kits festa"],
    };
  return { store: { businessType: type }, categories: [] as string[] };
}

/** Grade de tamanhos mais comuns, para sugerir no cadastro do produto. */
export const SIZE_PRESETS = [
  { label: "PP ao GG", sizes: ["PP", "P", "M", "G", "GG"] },
  { label: "34 ao 46", sizes: ["34", "36", "38", "40", "42", "44", "46"] },
  { label: "Calçados 34 ao 40", sizes: ["34", "35", "36", "37", "38", "39", "40"] },
  { label: "Tamanho único", sizes: ["U"] },
];
