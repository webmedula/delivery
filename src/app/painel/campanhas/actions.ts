"use server";

// Mesmo padrão do painel: storeId sempre da sessão, nunca do formulário.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Store } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStoreUser } from "@/lib/auth";
import { listCustomers } from "@/lib/customer-list";
import { AUDIENCES, inAudience, type AudienceKey } from "@/lib/campaign-message";

function parseAudience(raw: string, days: string): { key: AudienceKey; inactiveDays: number; stored: string } | null {
  const key = AUDIENCES.find((a) => a.key === raw)?.key;
  if (!key) return null;
  const inactiveDays = Math.min(365, Math.max(7, Number(days) || 30));
  return { key, inactiveDays, stored: key === "inactive" ? `inactive:${inactiveDays}` : key };
}

async function audienceIds(store: Store, key: AudienceKey, inactiveDays: number) {
  const rows = await listCustomers(store, { onlyOptIn: true, sort: "nome" });
  return rows.filter((r) => inAudience(r, key, { inactiveDays, ordersRequired: store.loyaltyOrdersRequired })).map((r) => r.id);
}

/** Quantos clientes receberiam (prévia no formulário). */
export async function countAudience(audience: string, days: string): Promise<number> {
  const { store } = await requireStoreUser();
  const a = parseAudience(audience, days);
  if (!a) return 0;
  return (await audienceIds(store, a.key, a.inactiveDays)).length;
}

export type CampaignState = { error?: string } | undefined;

export async function createCampaign(_: CampaignState, formData: FormData): Promise<CampaignState> {
  const { store, storeId } = await requireStoreUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name").slice(0, 80);
  const message = get("message").slice(0, 1000);
  if (name.length < 2) return { error: "Dê um nome para a campanha." };
  if (message.length < 5) return { error: "Escreva a mensagem." };
  const a = parseAudience(get("audience"), get("inactiveDays"));
  if (!a) return { error: "Escolha o público." };
  if (a.key === "reward" && !store.loyaltyEnabled) return { error: "Ative o programa de fidelidade para usar este público." };

  let couponId: string | null = get("couponId") || null;
  if (couponId && !(await db.coupon.findFirst({ where: { id: couponId, storeId } }))) couponId = null;
  if (/\{cupom\}/i.test(message) && !couponId) return { error: "A mensagem usa {cupom}: escolha um cupom." };
  // Cupom escolhido mas fora do texto: não liga à campanha, para não confundir o relatório.
  if (!/\{cupom\}/i.test(message)) couponId = null;

  const ids = await audienceIds(store, a.key, a.inactiveDays);
  if (ids.length === 0) return { error: "Nenhum cliente que aceita promoções está neste público ainda." };

  const campaign = await db.campaign.create({
    data: { storeId, name, message, audience: a.stored, couponId, recipients: { create: ids.map((customerId) => ({ customerId })) } },
  });
  revalidatePath("/painel/campanhas");
  redirect(`/painel/campanhas/${campaign.id}`);
}

async function ownRecipient(id: string, storeId: string) {
  return db.campaignRecipient.findFirst({ where: { id, campaign: { storeId } } });
}

/** Chamado quando o lojista toca em "Enviar" (o WhatsApp abre no navegador). */
export async function markSent(recipientId: string) {
  const { storeId } = await requireStoreUser();
  const r = await ownRecipient(recipientId, storeId);
  if (!r) return;
  await db.campaignRecipient.update({ where: { id: r.id }, data: { sentAt: r.sentAt ?? new Date(), skipped: false } });
  revalidatePath(`/painel/campanhas/${r.campaignId}`);
}

export async function skipRecipient(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const r = await ownRecipient(String(formData.get("id")), storeId);
  if (!r) return;
  await db.campaignRecipient.update({ where: { id: r.id }, data: { skipped: !r.skipped } });
  revalidatePath(`/painel/campanhas/${r.campaignId}`);
}

/** Cliente respondeu SAIR: para de receber promoções e sai das campanhas pendentes. */
export async function optOutCustomer(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const customer = await db.customer.findFirst({ where: { id: String(formData.get("customerId")), storeId } });
  if (!customer) return;
  await db.$transaction([
    db.customer.update({ where: { id: customer.id }, data: { marketingOptIn: false } }),
    db.campaignRecipient.updateMany({ where: { customerId: customer.id, sentAt: null }, data: { skipped: true } }),
  ]);
  revalidatePath("/painel", "layout");
}

export async function deleteCampaign(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.campaign.deleteMany({ where: { id: String(formData.get("id")), storeId } });
  revalidatePath("/painel/campanhas");
  redirect("/painel/campanhas");
}
