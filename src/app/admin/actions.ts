"use server";

// Ações do administrador da plataforma. Toda ação começa com requireAdmin().

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { endSupportSession, hashPassword, requireAdmin, startSupportSession } from "@/lib/auth";
import * as asaas from "@/lib/asaas";

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
