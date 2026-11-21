"use server";

// Ações do administrador da plataforma. Toda ação começa com requireAdmin().

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { endSupportSession, hashPassword, requireAdmin, startSupportSession } from "@/lib/auth";
import * as asaas from "@/lib/asaas";
import { removeDemoStores, setupDemoStores } from "../../../prisma/demo";
import { z } from "zod";
import { normalizePartnerCode, suggestPartnerCode } from "@/lib/partner";
import { isValidPhone, normalizePhone } from "@/lib/phone";

export type AdminState = { error?: string; ok?: string } | undefined;

async function log(adminEmail: string, action: string, storeId: string | null, detail?: string) {
  await db.adminLog.create({ data: { adminEmail, action, storeId, detail } });
}

function refresh(storeId: string) {
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/lojas/${storeId}`);
}

export async function blockStore(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = String(formData.get("storeId"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || null;
  await db.store.update({ where: { id }, data: { blockedAt: new Date(), blockedReason: reason } });
  await log(admin.email, "Bloqueou a loja", id, reason ?? undefined);
  refresh(id);
  return { ok: "Loja bloqueada." };
}

export async function unblockStore(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = String(formData.get("storeId"));
  await db.store.update({ where: { id }, data: { blockedAt: null, blockedReason: null } });
  await log(admin.email, "Desbloqueou a loja", id);
  refresh(id);
  return { ok: "Loja desbloqueada." };
}

/** Libera a loja por N dias a partir de hoje (ou soma ao teste que ainda está valendo). */
export async function grantDays(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = String(formData.get("storeId"));
  const days = Number(formData.get("days"));
  if (!Number.isInteger(days) || days < 1 || days > 365) return { error: "Informe de 1 a 365 dias." };

  const store = await db.store.findUnique({ where: { id } });
  if (!store) return { error: "Loja não encontrada." };
  const now = new Date();
  const from = store.trialEndsAt && store.trialEndsAt > now ? store.trialEndsAt : now;
  const trialEndsAt = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  await db.store.update({ where: { id }, data: { trialEndsAt } });
  await log(admin.email, `Liberou ${days} dia(s) de acesso`, id);
  refresh(id);
  return { ok: `Acesso liberado até ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(trialEndsAt)}.` };
}

export async function changePlan(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = String(formData.get("storeId"));
  const store = await db.store.findUnique({ where: { id }, include: { plan: true } });
  const plan = await db.plan.findFirst({ where: { code: String(formData.get("planCode")), active: true } });
  if (!store || !plan) return { error: "Loja ou plano não encontrado." };
  if (plan.id === store.planId) return { error: "A loja já está neste plano." };

  // Se a loja já tem assinatura no Asaas, o valor cobrado precisa mudar junto.
  if (store.billingSubscriptionId) {
    try {
      await asaas.updateSubscription(store.billingSubscriptionId, {
        value: plan.priceCents / 100,
        description: `Assinatura ${plan.name} - ${store.name}`,
      });
    } catch (e) {
      return { error: `O Asaas recusou a mudança de valor: ${e instanceof Error ? e.message : "erro"}. O plano não foi alterado.` };
    }
  }
  await db.store.update({ where: { id }, data: { planId: plan.id } });
  await log(admin.email, "Trocou o plano", id, `${store.plan.name} → ${plan.name}`);
  refresh(id);
  return { ok: `Plano alterado para ${plan.name}.` };
}

export async function resetPassword(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const user = await db.user.findUnique({ where: { id: String(formData.get("userId")) } });
  if (!user) return { error: "Usuário não encontrado." };
  // Senha provisória, mostrada uma única vez para o administrador repassar ao lojista.
  const password = randomBytes(9).toString("base64url");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await log(admin.email, "Redefiniu a senha", user.storeId, user.email);
  return { ok: `Senha provisória de ${user.email}: ${password}` };
}

export async function enterAsSupport(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("storeId"));
  const store = await db.store.findUnique({ where: { id } });
  if (!store) return;
  await startSupportSession(id);
  await log(admin.email, "Entrou no painel como suporte", id);
  redirect("/painel");
}

export async function leaveSupport() {
  await requireAdmin();
  await endSupportSession();
  redirect("/admin/lojas");
}

// --- Lojas demo (prisma/demo.ts) ---

export async function resetDemoStores(_: AdminState, _formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  try {
    const result = await setupDemoStores(db, { reset: true });
    await log(admin.email, "demo_reset", null, result.map((r) => r.slug).join(", "));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível recriar as lojas demo." };
  }
  revalidatePath("/admin", "layout");
  return { ok: "Lojas demo recriadas com dados novos." };
}

export async function deleteDemoStores(_: AdminState, _formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const count = await removeDemoStores(db);
  await log(admin.email, "demo_delete", null, `${count} loja(s)`);
  revalidatePath("/admin", "layout");
  return { ok: `${count} loja(s) demo apagada(s).` };
}

// ---------- Parceiros (revendedores) ----------

const partnerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do parceiro.").max(100),
  code: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("E-mail inválido.")]).optional(),
  pixKey: z.string().trim().max(120).optional(),
  commissionPercent: z.coerce.number().int("A comissão precisa ser um número inteiro.").min(0, "Comissão de 0 a 100%.").max(100, "Comissão de 0 a 100%."),
  notes: z.string().trim().max(1000).optional(),
});

/** Lê e confere o formulário de parceiro (criar e editar usam o mesmo). */
function readPartner(formData: FormData) {
  const parsed = partnerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const d = parsed.data;
  const code = normalizePartnerCode(d.code) || suggestPartnerCode(d.name);
  if (code.length < 3) return { error: "O código precisa ter pelo menos 3 letras ou números." } as const;
  const phone = d.whatsapp ? normalizePhone(d.whatsapp) : "";
  if (phone && !isValidPhone(phone)) return { error: "WhatsApp inválido. Use DDD + número." } as const;
  return {
    data: {
      name: d.name,
      code,
      whatsapp: phone || null,
      email: d.email || null,
      pixKey: d.pixKey || null,
      commissionPercent: d.commissionPercent,
      notes: d.notes || null,
    },
  } as const;
}

export async function createPartner(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const read = readPartner(formData);
  if ("error" in read) return { error: read.error };
  if (await db.partner.findUnique({ where: { code: read.data.code } }))
    return { error: `O código ${read.data.code} já é de outro parceiro. Escolha outro.` };
  const partner = await db.partner.create({ data: read.data });
  await log(admin.email, `Cadastrou o parceiro ${partner.name} (${partner.code})`, null);
  revalidatePath("/admin/parceiros");
  redirect(`/admin/parceiros/${partner.id}`);
}

export async function updatePartner(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = String(formData.get("partnerId"));
  const read = readPartner(formData);
  if ("error" in read) return { error: read.error };
  const taken = await db.partner.findUnique({ where: { code: read.data.code } });
  if (taken && taken.id !== id) return { error: `O código ${read.data.code} já é de outro parceiro. Escolha outro.` };
  const partner = await db.partner.update({ where: { id }, data: read.data });
  await log(admin.email, `Alterou o parceiro ${partner.name} (${partner.code})`, null);
  revalidatePath("/admin/parceiros", "layout");
  return { ok: "Parceiro salvo." };
}

/** Desativar: o código para de valer em cadastros novos. As lojas que ele já trouxe continuam ligadas a ele. */
export async function togglePartner(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = String(formData.get("partnerId"));
  const current = await db.partner.findUnique({ where: { id } });
  if (!current) return { error: "Parceiro não encontrado." };
  const partner = await db.partner.update({ where: { id }, data: { active: !current.active } });
  await log(admin.email, `${partner.active ? "Reativou" : "Desativou"} o parceiro ${partner.name} (${partner.code})`, null);
  revalidatePath("/admin/parceiros", "layout");
  return { ok: partner.active ? "Parceiro reativado." : "Parceiro desativado. O código não vale mais em cadastros novos." };
}

/** Liga (ou desliga) a loja a um parceiro, para quando o lojista esqueceu o código ou o parceiro montou a loja. */
export async function setStorePartner(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const storeId = String(formData.get("storeId"));
  const partnerId = String(formData.get("partnerId") ?? "") || null;
  const partner = partnerId ? await db.partner.findUnique({ where: { id: partnerId } }) : null;
  if (partnerId && !partner) return { error: "Parceiro não encontrado." };
  await db.store.update({ where: { id: storeId }, data: { partnerId } });
  await log(admin.email, partner ? `Ligou a loja ao parceiro ${partner.name} (${partner.code})` : "Tirou o parceiro da loja", storeId);
  refresh(storeId);
  revalidatePath("/admin/parceiros", "layout");
  return { ok: partner ? `Loja ligada a ${partner.name}.` : "A loja ficou sem parceiro." };
}
