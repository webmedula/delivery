// Montagem da mensagem de campanha, sem dependência de banco, para poder testar.

export const OPT_OUT_LINE = "Para não receber mais promoções, responda SAIR.";

export type MessageVars = { name: string; store: string; link: string; coupon?: string | null };

/** Troca {nome}, {loja}, {link} e {cupom} e garante a linha de descadastro no fim. */
export function renderCampaignMessage(template: string, v: MessageVars): string {
  const first = v.name.trim().split(/\s+/)[0] || "";
  let text = template
    .replace(/\{nome\}/gi, first)
    .replace(/\{loja\}/gi, v.store)
    .replace(/\{link\}/gi, v.link)
    .replace(/\{cupom\}/gi, v.coupon ?? "")
    .trim();
  if (!text.includes(OPT_OUT_LINE)) text += `\n\n${OPT_OUT_LINE}`;
  return text;
}

export type AudienceKey = "all" | "inactive" | "new" | "reward";

export const AUDIENCES: { key: AudienceKey; label: string; help: string }[] = [
  { key: "all", label: "Todos que aceitam promoções", help: "Todo cliente que marcou que quer receber promoções." },
  { key: "inactive", label: "Sumidos", help: "Não pedem há um tempo. Bom para um cupom de volta." },
  { key: "new", label: "Pediram só uma vez", help: "Para transformar o primeiro pedido em hábito." },
  { key: "reward", label: "Perto da recompensa", help: "Já ganharam a recompensa ou falta 1 selo (programa de fidelidade)." },
];

export type AudienceRow = { orders: number; lastOrderAt: Date | null; stamps: number | null; rewardAvailable: boolean };

/** Decide se o cliente (que já aceitou promoções) entra no público. */
export function inAudience(
  r: AudienceRow,
  audience: AudienceKey,
  opts: { inactiveDays: number; ordersRequired: number; now?: Date },
): boolean {
  const now = opts.now ?? new Date();
  switch (audience) {
    case "all":
      return true;
    case "inactive":
      return !!r.lastOrderAt && now.getTime() - r.lastOrderAt.getTime() >= opts.inactiveDays * 86_400_000;
    case "new":
      return r.orders === 1;
    case "reward":
      return r.stamps !== null && (r.rewardAvailable || r.stamps >= opts.ordersRequired - 1);
  }
}
