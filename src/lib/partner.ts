// Programa de parceiros: código de indicação e cálculo da comissão. Funções puras para poder testar.

import type { SubscriptionStatus } from "@prisma/client";
import { storeSituation } from "./subscription";

/** Comissão padrão de um parceiro novo (% da mensalidade de cada loja indicada que está pagando). */
export const DEFAULT_COMMISSION_PERCENT = 30;

/** Nome do parâmetro no link do parceiro: app.webtenda.com.br/cadastro?parceiro=MARIA (o site repassa o mesmo parâmetro). */
export const PARTNER_PARAM = "parceiro";

/** Deixa o código no formato guardado: sem acento, só letras maiúsculas e números, até 20 caracteres. "maria-silva" → "MARIASILVA". */
export function normalizePartnerCode(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20);
}

/** Sugestão de código a partir do nome do parceiro: o primeiro nome ("Maria Souza Design" → "MARIA"). */
export function suggestPartnerCode(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const code = normalizePartnerCode(first);
  return code.length >= 3 ? code : normalizePartnerCode(name);
}

type StoreRow = {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  blockedAt: Date | null;
  isDemo?: boolean;
  plan: { priceCents: number };
};

/** Uma loja conta para a comissão só quando a assinatura está em dia (situação "Ativa"). */
export function storePaysCommission(store: StoreRow, now = new Date()): boolean {
  return !store.isDemo && storeSituation(store, now) === "ACTIVE";
}

/** Comissão de uma loja, em centavos, arredondada para baixo. */
export function commissionCents(priceCents: number, percent: number): number {
  return Math.floor((priceCents * percent) / 100);
}

/** Resumo das lojas de um parceiro: quantas trouxe, quantas pagam, quanto elas pagam por mês e a comissão do mês. */
export function summarizePartner(stores: StoreRow[], percent: number, now = new Date()) {
  let paying = 0;
  let trial = 0;
  let monthlyCents = 0;
  let commission = 0;
  for (const store of stores) {
    if (store.isDemo) continue;
    if (storePaysCommission(store, now)) {
      paying++;
      monthlyCents += store.plan.priceCents;
      commission += commissionCents(store.plan.priceCents, percent);
    } else if (storeSituation(store, now) === "TRIAL") {
      trial++;
    }
  }
  return { total: stores.filter((s) => !s.isDemo).length, paying, trial, monthlyCents, commissionCents: commission };
}
