"use server";

// Todas as ações do painel pegam o storeId da sessão (requireStoreUser)
// e filtram por ele. Nunca usar um storeId vindo do formulário.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, type OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { deleteAbandonedImages, deleteUnusedImages } from "@/lib/images";
import { isUf, normalizeTrackingCode, parseShippingMethods } from "@/lib/shipping";
import { imageIdFromUrl } from "@/lib/image-url";
import { hashPassword, requireStoreUser } from "@/lib/auth";
import { randomBytes, randomInt } from "node:crypto";
import { parseBRLToCents } from "@/lib/money";
import { cancelStoreSubscription, subscribeStore } from "@/lib/billing";
import { normalizeCouponCode } from "@/lib/discounts";
import { createStoreSubaccount, setOnlineMethods } from "@/lib/payments";
import { normalizeCpfCnpj } from "@/lib/cpf-cnpj";
import { asaasSandbox } from "@/lib/asaas";
import { canEnableOnlinePayments } from "@/lib/payment-events";
import { HEX_COLOR } from "@/lib/theme";
import { parseMinutesRange, stampsFor } from "@/lib/delivery";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { releaseStock } from "@/lib/stock";
import { modulesFor, isBusinessType } from "@/lib/niche";
import { parseVariantRows, splitList } from "@/lib/variants";
import { tablesToCreate } from "@/lib/tables";

const DEMO_BLOCKED = "Esta é uma loja de demonstração: assinatura e pagamento online ficam desligados.";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "COMPLETED", "CANCELED",
];

export async function updateOrderStatus(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const id = String(formData.get("orderId"));
  const status = String(formData.get("status")) as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) return;
  const order = await db.order.findFirst({
    where: { id, storeId },
    select: { acceptedAt: true, dispatchedAt: true, completedAt: true, canceledAt: true },
  });
  if (!order) return;
  // Ao marcar como enviado, o código de rastreio pode vir junto.
  const tracking = formData.has("trackingCode") ? { trackingCode: normalizeTrackingCode(String(formData.get("trackingCode"))) } : {};
  await db.order.updateMany({ where: { id, storeId }, data: { status, ...stampsFor(status, order), ...tracking } });
  // Pedido cancelado: as peças voltam para o estoque.
  if (status === "CANCELED") await releaseStock(db, id);
  revalidatePath("/painel");
  revalidatePath("/painel/historico");
}

/** Código de rastreio de um pedido enviado (pode ser preenchido ou corrigido depois). */
export async function setTrackingCode(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.order.updateMany({
    where: { id: String(formData.get("orderId")), storeId, fulfillment: "SHIPPING" },
    data: { trackingCode: normalizeTrackingCode(String(formData.get("trackingCode") ?? "")) },
  });
  revalidatePath("/painel");
  revalidatePath("/painel/historico");
}

// --- Envios ---

export type ShippingState = { error?: string; ok?: boolean; savedAt?: number; ids?: string[] } | undefined;

/** Liga/desliga o envio e salva a tabela de frete (cria, edita e apaga formas de envio). */
export async function saveShippingSettings(_: ShippingState, formData: FormData): Promise<ShippingState> {
  const { storeId, store } = await requireStoreUser();
  const acceptsShipping = formData.get("acceptsShipping") === "on";
  const originUf = String(formData.get("originUf") ?? "");
  if (acceptsShipping && !isUf(originUf)) return { error: "Escolha o estado de onde você envia." };
  const freeRaw = String(formData.get("freeAbove") ?? "").trim();
  const freeAboveCents = freeRaw ? parseBRLToCents(freeRaw) : null;
  if (freeRaw && !freeAboveCents) return { error: "Valor do frete grátis inválido." };
  const parsed = parseShippingMethods(String(formData.get("methods") ?? "[]"), parseBRLToCents);
  if (!parsed.ok) return { error: parsed.error };
  if (acceptsShipping && !parsed.methods.some((m) => m.active)) return { error: "Cadastre pelo menos uma forma de envio ligada (ex.: PAC)." };
  if (!acceptsShipping && !store.acceptsDelivery && !store.acceptsPickup)
    return { error: "Sua loja precisa de pelo menos uma forma de receber: envio, entrega ou retirada (em Minha loja)." };

  const existing = await db.shippingMethod.findMany({ where: { storeId }, select: { id: true } });
  const known = new Set(existing.map((m) => m.id));
  const kept = new Set(parsed.methods.filter((m) => m.id && known.has(m.id)).map((m) => m.id!));
  const ids = await db.$transaction(async (tx) => {
    await tx.store.update({
      where: { id: storeId },
      data: { acceptsShipping, shippingOriginUf: isUf(originUf) ? originUf : null, shippingFreeAboveCents: freeAboveCents },
    });
    await tx.shippingMethod.deleteMany({ where: { storeId, id: { notIn: [...kept] } } });
    const out: string[] = [];
    for (const m of parsed.methods) {
      const { id, ...values } = m;
      if (id && kept.has(id)) out.push((await tx.shippingMethod.update({ where: { id }, data: values })).id);
      else out.push((await tx.shippingMethod.create({ data: { ...values, storeId } })).id);
    }
    return out;
  });
  revalidatePath("/painel/envios");
  revalidatePath("/painel", "layout");
  revalidatePath(`/loja/${store.slug}`, "layout");
  // Ids das formas salvas, na ordem do formulário (as novas ganham id e não são recriadas no próximo salvar).
  return { ok: true, savedAt: Date.now(), ids };
}

// --- Entregadores ---

export type CourierState = { error?: string; ok?: boolean } | undefined;

const newCourierToken = () => randomBytes(18).toString("base64url");

export async function createCourier(_: CourierState, formData: FormData): Promise<CourierState> {
  const { storeId } = await requireStoreUser();
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return { error: "Informe o nome do entregador." };
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!isValidPhone(phone)) return { error: "WhatsApp inválido. Use DDD + número, ex.: (11) 98888-7777." };
  if ((await db.courier.count({ where: { storeId } })) >= 50) return { error: "Limite de 50 entregadores." };
  await db.courier.create({ data: { storeId, name, phone, token: newCourierToken() } });
  revalidatePath("/painel/entregadores");
  return { ok: true };
}

export async function toggleCourier(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const courier = await db.courier.findFirst({ where: { id: String(formData.get("id")), storeId } });
  if (!courier) return;
  await db.courier.update({ where: { id: courier.id }, data: { active: !courier.active } });
  revalidatePath("/painel/entregadores");
}

export async function deleteCourier(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.courier.deleteMany({ where: { id: String(formData.get("id")), storeId } });
  revalidatePath("/painel/entregadores");
}

/** Troca o link do entregador (o antigo para de funcionar). Use se o celular dele for perdido. */
export async function resetCourierLink(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.courier.updateMany({ where: { id: String(formData.get("id")), storeId }, data: { token: newCourierToken() } });
  revalidatePath("/painel/entregadores");
}

/** Escolhe (ou tira) o entregador do pedido. */
export async function assignCourier(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const orderId = String(formData.get("orderId"));
  const courierId = String(formData.get("courierId") ?? "");
  const courier = courierId ? await db.courier.findFirst({ where: { id: courierId, storeId } }) : null;
  if (courierId && !courier) return;
  await db.order.updateMany({
    where: { id: orderId, storeId, fulfillment: "DELIVERY" },
    data: { courierId: courier?.id ?? null, courierName: courier?.name ?? null },
  });
  revalidatePath("/painel");
}

// --- Bairros e taxas de entrega ---

export type ZoneState = { error?: string; ok?: boolean } | undefined;

export async function createDeliveryZone(_: ZoneState, formData: FormData): Promise<ZoneState> {
  const { storeId } = await requireStoreUser();
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return { error: "Informe o nome do bairro." };
  const feeCents = parseBRLToCents(String(formData.get("fee") ?? "") || "0");
  if (feeCents === null) return { error: "Taxa inválida." };
  const count = await db.deliveryZone.count({ where: { storeId } });
  if (count >= 200) return { error: "Limite de 200 bairros." };
  try {
    await db.deliveryZone.create({ data: { storeId, name, feeCents } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Esse bairro já está cadastrado." };
    throw e;
  }
  revalidatePath("/painel/loja");
  return { ok: true };
}

export async function updateDeliveryZoneFee(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const feeCents = parseBRLToCents(String(formData.get("fee") ?? "") || "0");
  if (feeCents === null) return;
  await db.deliveryZone.updateMany({ where: { id: String(formData.get("id")), storeId }, data: { feeCents } });
  revalidatePath("/painel/loja");
}

export async function toggleDeliveryZone(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const zone = await db.deliveryZone.findFirst({ where: { id: String(formData.get("id")), storeId } });
  if (!zone) return;
  await db.deliveryZone.update({ where: { id: zone.id }, data: { active: !zone.active } });
  revalidatePath("/painel/loja");
}

export async function deleteDeliveryZone(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.deliveryZone.deleteMany({ where: { id: String(formData.get("id")), storeId } });
  revalidatePath("/painel/loja");
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

/** Foto do produto: link http(s) ou foto enviada ao sistema (/img/...). */
function isPhotoUrl(url: string) {
  return /^https?:\/\/\S+$/.test(url) || !!imageIdFromUrl(url);
}

export type ProductFormState = { error?: string; ok?: boolean; savedAt?: number } | undefined;

const productSchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(1, "Informe o nome do produto.").max(120),
  description: z.string().trim().max(1000).optional(),
  price: z.string(),
  compareAt: z.string().optional(),
  categoryId: z.string().optional(),
  imageUrl: z.string().trim().max(1000).refine((v) => v === "" || isPhotoUrl(v), "Link da foto inválido.").optional(),
  images: z.string().max(4000).optional(),
  stock: z.string().optional(),
  variants: z.string().max(40000).optional(),
});

/** Cria ou edita um produto (com cor, tamanho e estoque quando a loja usa variações). */
export async function saveProduct(_: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const { storeId, store } = await requireStoreUser();
  const modules = modulesFor(store);
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  const priceCents = parseBRLToCents(data.price);
  if (priceCents === null) return { error: "Preço inválido." };

  let compareAtCents: number | null = null;
  if (data.compareAt?.trim()) {
    compareAtCents = parseBRLToCents(data.compareAt);
    if (compareAtCents === null) return { error: "Preço \"de\" inválido." };
    if (compareAtCents <= priceCents) return { error: "O preço \"de\" (riscado) precisa ser maior que o preço de venda." };
  }

  const images = splitList((data.images ?? "").replace(/\s+/g, "\n"), 8);
  for (const url of images) if (!isPhotoUrl(url)) return { error: `Link de foto inválido: ${url.slice(0, 60)}` };

  let stock: number | null = null;
  if (data.stock?.trim()) {
    stock = Number(data.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 99999) return { error: "Estoque inválido. Use um número inteiro (ou deixe vazio para não controlar)." };
  }

  const variantsResult = modules.variants ? parseVariantRows(data.variants ?? "[]") : { ok: true as const, rows: [] };
  if (!variantsResult.ok) return { error: variantsResult.error };
  const rows = variantsResult.rows;

  let categoryId: string | null = data.categoryId || null;
  if (categoryId && !(await db.category.findFirst({ where: { id: categoryId, storeId } }))) categoryId = null;

  const fields = {
    categoryId,
    name: data.name,
    description: data.description || null,
    priceCents,
    compareAtCents,
    imageUrl: data.imageUrl || null,
    images,
    // Com variações, o estoque é o de cada cor/tamanho.
    stock: rows.length > 0 ? null : stock,
  };

  if (data.id) {
    const product = await db.product.findFirst({ where: { id: data.id, storeId }, include: { variants: true } });
    if (!product) return { error: "Produto não encontrado." };
    await db.$transaction(async (tx) => {
      await tx.product.update({ where: { id: product.id }, data: fields });
      if (!modules.variants) return;
      const existing = new Set(product.variants.map((v) => v.id));
      const kept = new Set(rows.filter((r) => r.id && existing.has(r.id)).map((r) => r.id!));
      await tx.productVariant.deleteMany({ where: { productId: product.id, id: { notIn: [...kept] } } });
      for (const r of rows) {
        const values = { color: r.color, size: r.size, stock: r.stock, priceCents: r.priceCents, position: r.position, active: r.active };
        if (r.id && kept.has(r.id)) await tx.productVariant.update({ where: { id: r.id }, data: values });
        else await tx.productVariant.create({ data: { ...values, storeId, productId: product.id } });
      }
    });
    // Fotos enviadas que saíram do produto deixam de ocupar espaço.
    await deleteUnusedImages(storeId, [product.imageUrl, ...product.images]);
  } else {
    const total = await db.product.count({ where: { storeId } });
    if (store.plan.maxProducts > 0 && total >= store.plan.maxProducts)
      return { error: `Seu plano permite até ${store.plan.maxProducts} produtos. Faça upgrade para cadastrar mais.` };
    await db.product.create({
      data: {
        storeId,
        ...fields,
        position: total,
        variants: { create: rows.map((r) => ({ storeId, color: r.color, size: r.size, stock: r.stock, priceCents: r.priceCents, position: r.position, active: r.active })) },
      },
    });
  }
  await deleteAbandonedImages(storeId);
  revalidatePath("/painel/cardapio");
  revalidatePath("/painel/estoque");
  revalidatePath(`/loja/${store.slug}`, "layout");
  return { ok: true, savedAt: Date.now() };
}

/** Ajuste rápido de estoque na tela de Estoque (uma variação ou um produto sem variações). */
export async function setStock(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const raw = String(formData.get("stock") ?? "").trim();
  const stock = raw === "" ? null : Number(raw);
  if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 99999)) return;
  const variantId = String(formData.get("variantId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (variantId) await db.productVariant.updateMany({ where: { id: variantId, storeId }, data: { stock } });
  else if (productId) await db.product.updateMany({ where: { id: productId, storeId }, data: { stock } });
  revalidatePath("/painel/estoque");
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
  const product = await db.product.findFirst({ where: { id: String(formData.get("id")), storeId }, select: { id: true, imageUrl: true, images: true } });
  if (!product) return;
  await db.product.delete({ where: { id: product.id } });
  await deleteUnusedImages(storeId, [product.imageUrl, ...product.images]);
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

  const logoUrl = get("logoUrl");
  if (logoUrl && !/^(https?:\/\/|\/)\S+$/.test(logoUrl)) return { error: "Link do logo inválido." };
  const previousLogo = (await db.store.findUnique({ where: { id: storeId }, select: { logoUrl: true } }))?.logoUrl;
  const themeColor = get("themeColor").toLowerCase();
  if (themeColor && !HEX_COLOR.test(themeColor)) return { error: "Cor inválida." };

  const deliveryTime = parseMinutesRange(get("deliveryMinutesMin"), get("deliveryMinutesMax"));
  if ("error" in deliveryTime) return { error: `Tempo de entrega: ${deliveryTime.error}` };
  const pickupTime = parseMinutesRange(get("pickupMinutesMin"), get("pickupMinutesMax"));
  if ("error" in pickupTime) return { error: `Tempo de retirada: ${pickupTime.error}` };

  const acceptsDelivery = formData.get("acceptsDelivery") === "on";
  const acceptsPickup = formData.get("acceptsPickup") === "on";
  if (!acceptsDelivery && !acceptsPickup && !(await db.store.findUnique({ where: { id: storeId }, select: { acceptsShipping: true } }))?.acceptsShipping)
    return { error: "Ative entrega, retirada ou o envio pelos Correios (em Envios)." };
  const businessType = get("businessType");
  const whatsappCheckout = formData.get("whatsappCheckout") === "on";
  if (whatsappCheckout && !whatsapp) return { error: "Para fechar pedidos pelo WhatsApp, informe o WhatsApp da loja." };

  await db.store.update({
    where: { id: storeId },
    data: {
      name,
      description: get("description") || null,
      whatsapp: whatsapp || null,
      address: get("address") || null,
      pixKey: get("pixKey") || null,
      logoUrl: logoUrl || null,
      themeColor: themeColor && themeColor !== "#ea580c" ? themeColor : null,
      deliveryFeeCents,
      minOrderCents,
      acceptsDelivery,
      acceptsPickup,
      deliveryMinutesMin: deliveryTime.min,
      deliveryMinutesMax: deliveryTime.max,
      pickupMinutesMin: pickupTime.min,
      pickupMinutesMax: pickupTime.max,
      isOpen: formData.get("isOpen") === "on",
      whatsappCheckout,
      ...(isBusinessType(businessType) ? { businessType } : {}),
    },
  });
  if (previousLogo !== (logoUrl || null)) await deleteUnusedImages(storeId, [previousLogo]);
  revalidatePath("/painel", "layout");
  return { ok: true };
}

export type BillingState = { error?: string; ok?: boolean } | undefined;

export async function subscribe(_: BillingState, formData: FormData): Promise<BillingState> {
  const { storeId, store } = await requireStoreUser();
  if (store.isDemo) return { error: DEMO_BLOCKED };
  const result = await subscribeStore(storeId, String(formData.get("planCode") ?? ""), String(formData.get("cpfCnpj") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/painel", "layout");
  if (result.invoiceUrl) redirect(result.invoiceUrl);
  return { ok: true };
}

export async function cancelSubscription(_: BillingState, _formData: FormData): Promise<BillingState> {
  const { storeId, store } = await requireStoreUser();
  if (store.isDemo) return { error: DEMO_BLOCKED };
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

// --- Pagamento online (subconta Asaas da loja) ---

export type PaymentAccountState = { error?: string; ok?: boolean } | undefined;

const COMPANY_TYPES = ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"] as const;

export async function createPaymentAccount(_: PaymentAccountState, formData: FormData): Promise<PaymentAccountState> {
  const { storeId, store, user } = await requireStoreUser();
  if (store.isDemo) return { error: DEMO_BLOCKED };
  const get = (k: string) => String(formData.get(k) ?? "").trim();

  const cpfCnpj = normalizeCpfCnpj(get("cpfCnpj"));
  if (!cpfCnpj) return { error: "CPF ou CNPJ inválido." };
  const isCompany = cpfCnpj.length === 14;
  const name = get("name");
  if (name.length < 3) return { error: isCompany ? "Informe a razão social." : "Informe o nome completo." };
  const email = get("email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "E-mail inválido." };
  const birthDate = get("birthDate");
  if (!isCompany && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { error: "Informe a data de nascimento." };
  const companyType = get("companyType") as (typeof COMPANY_TYPES)[number];
  if (isCompany && !COMPANY_TYPES.includes(companyType)) return { error: "Escolha o tipo de empresa." };
  const mobilePhone = get("mobilePhone").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (mobilePhone.length < 10 || mobilePhone.length > 11) return { error: "Celular inválido. Use DDD + número." };
  const incomeCents = parseBRLToCents(get("income"));
  if (!incomeCents) return { error: isCompany ? "Informe o faturamento mensal." : "Informe a renda mensal." };
  const postalCode = get("postalCode").replace(/\D/g, "");
  if (postalCode.length !== 8) return { error: "CEP inválido." };
  if (!get("address") || !get("addressNumber") || !get("province")) return { error: "Preencha endereço, número e bairro." };

  const result = await createStoreSubaccount(storeId, {
    name,
    email,
    cpfCnpj,
    ...(isCompany ? { companyType } : { birthDate }),
    mobilePhone,
    incomeValue: incomeCents / 100,
    address: get("address"),
    addressNumber: get("addressNumber"),
    complement: get("complement") || undefined,
    province: get("province"),
    postalCode,
  });
  if (!result.ok) return { error: result.error };
  console.info(`[pagamentos] subconta criada para a loja ${storeId} por ${user.email}`);
  revalidatePath("/painel/pagamentos");
  return { ok: true };
}

export async function updateOnlineMethods(_: PaymentAccountState, formData: FormData): Promise<PaymentAccountState> {
  const { store } = await requireStoreUser();
  if (store.isDemo) return { error: DEMO_BLOCKED };
  const pix = formData.get("pix") === "on";
  const card = formData.get("card") === "on";
  if ((pix || card) && !canEnableOnlinePayments(store, asaasSandbox()))
    return { error: "Sua conta de recebimento ainda não foi aprovada pelo Asaas." };
  const result = await setOnlineMethods(store, pix, card);
  if (!result.ok) return { error: result.error };
  revalidatePath("/painel/pagamentos");
  return { ok: true };
}

// --- Código de acesso do cliente (para entrar em "Minha conta" sem PIN) ---

const LOGIN_CODE_MINUTES = 30;

/** Gera um código de 6 números, válido por 30 minutos e uma única vez. Devolve o código para a loja enviar no WhatsApp. */
export async function createCustomerLoginCode(customerId: string): Promise<{ code: string } | { error: string }> {
  const { storeId } = await requireStoreUser();
  const customer = await db.customer.findFirst({ where: { id: customerId, storeId } });
  if (!customer) return { error: "Cliente não encontrado." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.customer.update({
    where: { id: customer.id },
    data: {
      loginCodeHash: await hashPassword(code),
      loginCodeExpiresAt: new Date(Date.now() + LOGIN_CODE_MINUTES * 60_000),
      pinFailures: 0,
      pinLockedUntil: null,
    },
  });
  return { code };
}

// --- Mesas (pedido na mesa por QR code) ---

export type TableState = { error?: string; ok?: boolean; created?: number } | undefined;

/** Código do QR da mesa: curto (o QR fica simples de ler) e difícil de adivinhar. */
const newTableCode = () => randomBytes(6).toString("base64url");

/** Cria várias mesas numeradas de uma vez, ex.: "Mesa" de 1 a 12. */
export async function createTables(_: TableState, formData: FormData): Promise<TableState> {
  const { storeId } = await requireStoreUser();
  const existing = await db.diningTable.findMany({ where: { storeId }, select: { label: true, position: true } });
  const plan = tablesToCreate(
    String(formData.get("prefix") ?? ""),
    String(formData.get("from") ?? ""),
    String(formData.get("to") ?? ""),
    existing.map((t) => t.label),
  );
  if ("error" in plan) return { error: plan.error };
  const start = existing.reduce((m, t) => Math.max(m, t.position), 0) + 1;
  await db.diningTable.createMany({
    data: plan.labels.map((label, i) => ({ storeId, label, code: newTableCode(), position: start + i })),
    skipDuplicates: true,
  });
  revalidatePath("/painel/mesas");
  return { ok: true, created: plan.labels.length };
}

export async function renameTable(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const label = String(formData.get("label") ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!label) return;
  try {
    await db.diningTable.updateMany({ where: { id: String(formData.get("id")), storeId }, data: { label } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // nome repetido: ignora
  }
  revalidatePath("/painel/mesas");
}

export async function toggleTable(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const table = await db.diningTable.findFirst({ where: { id: String(formData.get("id")), storeId } });
  if (!table) return;
  await db.diningTable.update({ where: { id: table.id }, data: { active: !table.active } });
  revalidatePath("/painel/mesas");
}

/** Troca o QR da mesa (o impresso para de funcionar). Use se alguém levou o QR para casa. */
export async function resetTableCode(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.diningTable.updateMany({ where: { id: String(formData.get("id")), storeId }, data: { code: newTableCode() } });
  revalidatePath("/painel/mesas");
}

export async function deleteTable(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.diningTable.deleteMany({ where: { id: String(formData.get("id")), storeId } });
  revalidatePath("/painel/mesas");
}

/** "Atendido": tira o chamado do garçom / pedido de conta do quadro. */
export async function dismissTableCall(formData: FormData) {
  const { storeId } = await requireStoreUser();
  await db.diningTable.updateMany({ where: { id: String(formData.get("id")), storeId }, data: { callKind: null, calledAt: null } });
  revalidatePath("/painel");
  revalidatePath("/painel/mesas");
}

/**
 * Fecha a conta da mesa: os pedidos saem da conta aberta, os que ainda estavam
 * em andamento são dados como servidos e o chamado da mesa é apagado.
 */
export async function closeTableBill(formData: FormData) {
  const { storeId } = await requireStoreUser();
  const table = await db.diningTable.findFirst({ where: { id: String(formData.get("id")), storeId } });
  if (!table) return;
  const now = new Date();
  await db.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: { storeId, tableId: table.id, billClosedAt: null },
      select: { id: true, status: true, paymentStatus: true, acceptedAt: true, dispatchedAt: true, completedAt: true, canceledAt: true },
    });
    for (const o of orders) {
      // Pedido pago online que nunca foi pago fica de fora da conta e é cancelado.
      const unpaid = o.paymentStatus === "AWAITING";
      const finished = o.status === "COMPLETED" || o.status === "CANCELED";
      const status: OrderStatus = unpaid ? "CANCELED" : finished ? o.status : "COMPLETED";
      await tx.order.update({
        where: { id: o.id },
        data: { billClosedAt: now, ...(status !== o.status ? { status, ...stampsFor(status, o, now) } : {}) },
      });
    }
    await tx.diningTable.update({ where: { id: table.id }, data: { callKind: null, calledAt: null } });
  });
  revalidatePath("/painel");
  revalidatePath("/painel/mesas");
  revalidatePath("/painel/historico");
}
