"use server";

// Profissionais da barbearia/salão: expediente, intervalo, serviços e comissão.
// Como no resto do painel, o storeId vem sempre da sessão.

import { revalidatePath } from "next/cache";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { imageIdFromUrl } from "@/lib/image-url";
import { deleteUnusedImages } from "@/lib/images";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { parseBreak, parseWorkHours } from "@/lib/booking";

export type ProfessionalFormState = { error?: string; ok?: boolean; savedAt?: number } | undefined;

function refresh(slug: string) {
  revalidatePath("/painel/profissionais");
  revalidatePath("/painel/agenda");
  revalidatePath(`/loja/${slug}`);
}

export async function saveProfessional(_: ProfessionalFormState, formData: FormData): Promise<ProfessionalFormState> {
  const { storeId, store } = await requireStoreUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const id = get("id");
  const name = get("name").slice(0, 80);
  if (name.length < 2) return { error: "Informe o nome do profissional." };
  const phone = normalizePhone(get("phone"));
  if (phone && !isValidPhone(phone)) return { error: "Telefone inválido. Use DDD + número." };
  const photoUrl = get("photoUrl");
  if (photoUrl && !/^https?:\/\/\S+$/.test(photoUrl) && !imageIdFromUrl(photoUrl)) return { error: "Foto inválida." };
  const hours = parseWorkHours(
    Array.from({ length: 7 }, (_, d) => ({ off: formData.get(`works${d}`) !== "on", start: get(`start${d}`), end: get(`end${d}`) })),
  );
  if ("error" in hours) return { error: hours.error };
  const pause = parseBreak(get("breakStart"), get("breakEnd"));
  if ("error" in pause) return { error: pause.error };
  const commissionRaw = get("commissionPercent").replace("%", "");
  const commission = commissionRaw ? Number(commissionRaw.replace(",", ".")) : null;
  if (commission !== null && (!Number.isFinite(commission) || commission < 0 || commission > 100))
    return { error: "Comissão deve ser de 0 a 100% (ou vazia)." };
  const wanted = formData.getAll("serviceIds").map(String);
  const valid = wanted.length ? (await db.product.findMany({ where: { storeId, id: { in: wanted } }, select: { id: true } })).map((p) => p.id) : [];
  const total = await db.product.count({ where: { storeId } });
  // Marcou todos = faz todos (inclusive os serviços que forem cadastrados depois).
  const serviceIds = valid.length === total ? [] : valid;

  const data = {
    name,
    phone: phone || null,
    photoUrl: photoUrl || null,
    workHours: hours.hours,
    breakStart: pause.start,
    breakEnd: pause.end,
    serviceIds,
    commissionPercent: commission === null ? null : Math.round(commission),
  };
  if (id) {
    const current = await db.professional.findFirst({ where: { id, storeId } });
    if (!current) return { error: "Profissional não encontrado." };
    await db.professional.update({ where: { id }, data });
    if (current.photoUrl !== data.photoUrl) await deleteUnusedImages(storeId, [current.photoUrl]);
  } else {
    const position = await db.professional.count({ where: { storeId } });
    await db.professional.create({ data: { ...data, storeId, position } });
  }
  refresh(store.slug);
  return { ok: true, savedAt: Date.now() };
}

/** Pausa (some da agenda online, mantém o histórico) ou volta a atender. */
export async function toggleProfessional(formData: FormData) {
  const { storeId, store } = await requireStoreUser();
  const pro = await db.professional.findFirst({ where: { id: String(formData.get("id") ?? ""), storeId } });
  if (!pro) return;
  await db.professional.update({ where: { id: pro.id }, data: { active: !pro.active } });
  refresh(store.slug);
}

/** Exclui. Os atendimentos antigos continuam no histórico com o nome copiado. */
export async function deleteProfessional(formData: FormData) {
  const { storeId, store } = await requireStoreUser();
  const pro = await db.professional.findFirst({ where: { id: String(formData.get("id") ?? ""), storeId } });
  if (!pro) return;
  await db.professional.delete({ where: { id: pro.id } });
  await deleteUnusedImages(storeId, [pro.photoUrl]);
  refresh(store.slug);
}
