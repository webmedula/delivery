"use server";

// Encomendas: regras da agenda (antecedência, dias, horários, limite, sinal) e sinal recebido.
// Como no resto do painel, o storeId vem sempre da sessão.

import { revalidatePath } from "next/cache";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEPOSIT_OPTIONS, parseClosedDates, parseTimes } from "@/lib/preorder";

export type PreorderSettingsState = { error?: string; ok?: boolean } | undefined;

export async function savePreorderSettings(_: PreorderSettingsState, formData: FormData): Promise<PreorderSettingsState> {
  const { storeId } = await requireStoreUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();

  const minHours = Number(get("preorderMinHours"));
  if (!Number.isInteger(minHours) || minHours < 0 || minHours > 24 * 30) return { error: "Antecedência inválida." };
  const maxDays = Number(get("preorderMaxDays") || "30");
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 180) return { error: "Aceite encomendas de 1 a 180 dias à frente." };
  if (minHours > maxDays * 24) return { error: "A antecedência mínima é maior que o prazo máximo da agenda." };
  const weekdays = formData.getAll("preorderWeekdays").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (weekdays.length === 0) return { error: "Marque pelo menos um dia da semana." };
  const times = parseTimes(get("preorderTimes"));
  if ("error" in times) return { error: times.error };
  const limitRaw = get("preorderDailyLimit");
  const dailyLimit = limitRaw ? Number(limitRaw) : null;
  if (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 999))
    return { error: "O limite por dia deve ser um número de 1 a 999 (ou vazio para não limitar)." };
  const closed = parseClosedDates(get("preorderClosedDates"));
  if ("error" in closed) return { error: closed.error };
  const deposit = Number(get("depositPercent"));
  if (!DEPOSIT_OPTIONS.includes(deposit)) return { error: "Sinal inválido." };

  await db.store.update({
    where: { id: storeId },
    data: {
      preorderMinHours: minHours,
      preorderMaxDays: maxDays,
      preorderWeekdays: [...new Set(weekdays)].sort(),
      preorderTimes: times.times,
      preorderDailyLimit: dailyLimit,
      preorderClosedDates: closed.dates,
      depositPercent: deposit,
    },
  });
  revalidatePath("/painel/encomendas");
  return { ok: true };
}

/** A loja recebeu o sinal por fora (Pix pela chave, WhatsApp): marca ou desfaz. */
export async function toggleDepositPaid(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const order = await db.order.findFirst({
    where: { id: String(formData.get("orderId") ?? ""), storeId, depositCents: { not: null } },
    select: { id: true, depositPaidAt: true, paymentStatus: true },
  });
  if (!order || order.paymentStatus === "PAID") return;
  await db.order.update({ where: { id: order.id }, data: { depositPaidAt: order.depositPaidAt ? null : new Date() } });
  revalidatePath("/painel");
  revalidatePath("/painel/encomendas");
}
