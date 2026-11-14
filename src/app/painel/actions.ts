"use server";

// Todas as ações do painel pegam o storeId da sessão (requireStoreUser)
// e filtram por ele. Nunca usar um storeId vindo do formulário.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, type OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStoreUser } from "@/lib/auth";
import { parseBRLToCents } from "@/lib/money";
import { cancelStoreSubscription, subscribeStore } from "@/lib/billing";
import { normalizeCouponCode } from "@/lib/discounts";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "COMPLETED", "CANCELED",
];

export async function updateOrderStatus(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const id = String(formData.get("orderId"));
  const status = String(formData.get("status")) as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) return;
  await db.order.updateMany({ where: { id, storeId }, data: { status } });
  revalidatePath("/painel");
}

export async function createCategory(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const count = await db.category.count({ where: { storeId } });
  await db.category.create({ data: { storeId, name, position: count } });
  revalidatePath("/painel/cardapio");
}

export async function deleteCategory(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.category.deleteMany({ where: { id: String(formData.get("id")), storeId } });
  revalidatePath("/painel/cardapio");
}

export type ProductFormState = { error?: string; ok?: boolean } | undefined;

const productSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do produto."),
  description: z.string().trim().max(500).optional(),
  price: z.string(),
  categoryId: z.string().optional(),
  imageUrl: z.string().trim().url("URL da imagem inválida.").optional().or(z.literal("")),
});

export async function createProduct(_: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const { storeId, store } = await requireStoreUser();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const priceCents = parseBRLToCents(parsed.data.price);
  if (priceCents === null) return { error: "Preço inválido." };

  const total = await db.product.count({ where: { storeId } });
  if (store.plan.maxProducts > 0 && total >= store.plan.maxProducts)
    return { error: `Seu plano permite até ${store.plan.maxProducts} produtos. Faça upgrade para cadastrar mais.` };

  let categoryId: string | null = parsed.data.categoryId || null;
  if (categoryId) {
    const owns = await db.category.findFirst({ where: { id: categoryId, storeId } });
    if (!owns) categoryId = null;
  }

  await db.product.create({
    data: {
      storeId,
      categoryId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      priceCents,
      imageUrl: parsed.data.imageUrl || null,
      position: total,
    },
  });
  revalidatePath("/painel/cardapio");
  return { ok: true };
}

export async function toggleProduct(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const id = String(formData.get("id"));
  const product = await db.product.findFirst({ where: { id, storeId } });
  if (!product) return;
  await db.product.update({ where: { id }, data: { available: !product.available } });
  revalidatePath("/painel/cardapio");
}

export async function deleteProduct(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.product.deleteMany({ where: { id: String(formData.get("id")), storeId } });
  revalidatePath("/painel/cardapio");
}

export type SettingsState = { error?: string; ok?: boolean } | undefined;

export async function updateStoreSettings(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const { storeId } = await requireStoreUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();

  const name = get("name");
  if (name.length < 2) return { error: "Informe o nome da loja." };
  const deliveryFeeCents = parseBRLToCents(get("deliveryFee") || "0");
  const minOrderCents = parseBRLToCents(get("minOrder") || "0");
  if (deliveryFeeCents === null || minOrderCents === null) return { error: "Valor inválido." };
  const whatsapp = get("whatsapp").replace(/\D/g, "");
  if (whatsapp && (whatsapp.length < 12 || whatsapp.length > 13))
    return { error: "WhatsApp deve ter DDI + DDD + número, ex.: 5511999999999." };

  const acceptsDelivery = formData.get("acceptsDelivery") === "on";
  const acceptsPickup = formData.get("acceptsPickup") === "on";
  if (!acceptsDelivery && !acceptsPickup) return { error: "Ative entrega, retirada ou os dois." };

  await db.store.update({
    where: { id: storeId },
    data: {
      name,
      description: get("description") || null,
      whatsapp: whatsapp || null,
      address: get("address") || null,
      pixKey: get("pixKey") || null,
      deliveryFeeCents,
      minOrderCents,
      acceptsDelivery,
      acceptsPickup,
      isOpen: formData.get("isOpen") === "on",
    },
  });
  revalidatePath("/painel", "layout");
  return { ok: true };
}

export type BillingState = { error?: string; ok?: boolean } | undefined;

export async function subscribe(_: BillingState, formData: FormData): Promise<BillingState> {
  const { storeId } = await requireStoreUser();
  const result = await subscribeStore(storeId, String(formData.get("planCode") ?? ""), String(formData.get("cpfCnpj") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/painel", "layout");
  if (result.invoiceUrl) redirect(result.invoiceUrl);
  return { ok: true };
}

export async function cancelSubscription(_: BillingState, _formData: FormData): Promise<BillingState> {
  const { storeId } = await requireStoreUser();
  const result = await cancelStoreSubscription(storeId);
  revalidatePath("/painel", "layout");
  return result.ok ? { ok: true } : { error: result.error };
}

// --- Cupons e fidelidade ---

export type PromoState = { error?: string; ok?: boolean } | undefined;

function parseDiscount(type: string, raw: string): { type: "PERCENT" | "FIXED"; value: number } | { error: string } {
  if (type === "PERCENT") {
    const value = Number(raw.replace(",", "."));
    if (!Number.isInteger(value) || value < 1 || value > 100) return { error: "A porcentagem deve ser um número inteiro de 1 a 100." };
    return { type, value };
  }
  const value = parseBRLToCents(raw);
  if (!value) return { error: "Informe o valor do desconto em reais." };
  return { type: "FIXED", value };
}

export async function createCoupon(_: PromoState, formData: FormData): Promise<PromoState> {
  const { storeId } = await requireStoreUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const code = normalizeCouponCode(get("code"));
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return { error: "O código deve ter de 3 a 20 letras ou números, sem espaços." };
  const discount = parseDiscount(get("type"), get("value"));
  if ("error" in discount) return discount;
  const minOrderCents = parseBRLToCents(get("minOrder") || "0");
  if (minOrderCents === null) return { error: "Pedido mínimo inválido." };
  const maxUses = Number(get("maxUses") || "0");
  if (!Number.isInteger(maxUses) || maxUses < 0) return { error: "Limite de usos inválido." };
  let expiresAt: Date | null = null;
  if (get("expiresAt")) {
    // Vale até o fim do dia escolhido, no horário de Brasília.
    expiresAt = new Date(`${get("expiresAt")}T23:59:59-03:00`);
    if (Number.isNaN(expiresAt.getTime())) return { error: "Data de validade inválida." };
  }
  try {
    await db.coupon.create({
      data: {
        storeId, code, ...discount, minOrderCents, maxUses, expiresAt,
        oncePerCustomer: formData.get("oncePerCustomer") === "on",
        firstOrderOnly: formData.get("firstOrderOnly") === "on",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe um cupom com esse código." };
    throw e;
  }
  revalidatePath("/painel/promocoes");
  return { ok: true };
}

export async function toggleCoupon(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const coupon = await db.coupon.findFirst({ where: { id: String(formData.get("id")), storeId } });
  if (!coupon) return;
  await db.coupon.update({ where: { id: coupon.id }, data: { active: !coupon.active } });
  revalidatePath("/painel/promocoes");
}

export async function deleteCoupon(formData: FormData) {
  const { storeId } = await requireStoreUser();
  // Pedidos antigos guardam uma cópia do código, então apagar não perde o histórico.
  await db.coupon.deleteMany({ where: { id: String(formData.get("id")), storeId } });
  revalidatePath("/painel/promocoes");
}

export async function updateLoyalty(_: PromoState, formData: FormData): Promise<PromoState> {
  const { storeId } = await requireStoreUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const enabled = formData.get("loyaltyEnabled") === "on";
  const ordersRequired = Number(get("ordersRequired"));
  if (!Number.isInteger(ordersRequired) || ordersRequired < 2 || ordersRequired > 50)
    return { error: "O número de pedidos deve ser de 2 a 50." };
  const discount = parseDiscount(get("type"), get("value"));
  if ("error" in discount) return discount;
  const minOrderCents = parseBRLToCents(get("minOrder") || "0");
  if (minOrderCents === null) return { error: "Valor mínimo inválido." };
  await db.store.update({
    where: { id: storeId },
    data: {
      loyaltyEnabled: enabled,
      loyaltyOrdersRequired: ordersRequired,
      loyaltyRewardType: discount.type,
      loyaltyRewardValue: discount.value,
      loyaltyMinOrderCents: minOrderCents,
    },
  });
  revalidatePath("/painel", "layout");
  return { ok: true };
}
