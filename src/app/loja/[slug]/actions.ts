"use server";

import { Prisma, type Store } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { quoteOrder } from "@/lib/order-calc";
import { canTakeOrders } from "@/lib/subscription";
import { parseBRLToCents } from "@/lib/money";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { checkCoupon, discountCents, normalizeCouponCode, type CouponCheck } from "@/lib/discounts";
import { cancelAwaitingOrder, createOrderPayment, onlineMethods } from "@/lib/payments";
import { normalizeCpfCnpj } from "@/lib/cpf-cnpj";
import { MIN_ONLINE_PAYMENT_CENTS } from "@/lib/payment-events";
import { clearCustomerSession, getLoyaltyStatus, getSessionCustomer, setCustomerSession } from "@/lib/customers";

const schema = z.object({
  slug: z.string(),
  cart: z.array(z.object({ productId: z.string(), quantity: z.number().int(), notes: z.string().optional() })).max(50),
  customerName: z.string().trim().min(2, "Informe seu nome.").max(100),
  customerPhone: z.string().trim().min(8, "Informe seu telefone."),
  fulfillment: z.enum(["DELIVERY", "PICKUP"]),
  address: z.string().trim().max(300).optional(),
  paymentMethod: z.enum(["PIX", "CASH", "CARD_ON_DELIVERY", "ONLINE_PIX", "ONLINE_CARD"]),
  cpfCnpj: z.string().max(20).optional(),
  changeFor: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  couponCode: z.string().max(40).optional(),
  useReward: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
});

export type PlaceOrderResult = { ok: true; orderId: string } | { ok: false; error: string };

/** Valida um cupom para a loja e o cliente (customerId null = cliente novo). */
async function evaluateCoupon(storeId: string, rawCode: string, customerId: string | null, subtotalCents: number) {
  const code = normalizeCouponCode(rawCode);
  const coupon = await db.coupon.findUnique({ where: { storeId_code: { storeId, code } } });
  if (!coupon) return { coupon: null, check: { ok: false, error: "Cupom inválido." } as CouponCheck };
  const notCanceled = { status: { not: "CANCELED" as const } };
  const [totalUses, customerUses, customerOrders] = await Promise.all([
    db.order.count({ where: { couponId: coupon.id, ...notCanceled } }),
    customerId ? db.order.count({ where: { couponId: coupon.id, customerId, ...notCanceled } }) : 0,
    customerId ? db.order.count({ where: { customerId, ...notCanceled } }) : 0,
  ]);
  return { coupon, check: checkCoupon(coupon, { totalUses, customerUses, customerOrders }, subtotalCents) };
}

/** Cliente do pedido. `trusted` = este aparelho está logado como esse cliente. */
async function resolveCustomer(store: Store, phone: string) {
  const session = await getSessionCustomer(store.id);
  if (session && session.phone === phone) return { customer: session, trusted: true, isNew: false };
  const existing = await db.customer.findUnique({ where: { storeId_phone: { storeId: store.id, phone } } });
  if (existing) return { customer: existing, trusted: false, isNew: false };
  return { customer: null, trusted: true, isNew: true };
}

export async function placeOrder(input: z.input<typeof schema>): Promise<PlaceOrderResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const phone = normalizePhone(data.customerPhone);
  if (!isValidPhone(phone)) return { ok: false, error: "Telefone inválido. Use DDD + número, ex.: (11) 98888-7777." };

  const store = await db.store.findUnique({ where: { slug: data.slug }, include: { plan: true } });
  if (!store) return { ok: false, error: "Loja não encontrada." };
  if (!store.isOpen || !canTakeOrders(store)) return { ok: false, error: "A loja não está recebendo pedidos agora." };
  if (data.fulfillment === "DELIVERY" && !data.address) return { ok: false, error: "Informe o endereço de entrega." };

  if (store.plan.maxOrdersMonth > 0) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const count = await db.order.count({ where: { storeId: store.id, createdAt: { gte: monthStart }, paymentStatus: { not: "FAILED" } } });
    if (count >= store.plan.maxOrdersMonth) return { ok: false, error: "A loja não está recebendo pedidos agora." };
  }

  const catalog = await db.product.findMany({
    where: { storeId: store.id, id: { in: data.cart.map((c) => c.productId) } },
    select: { id: true, name: true, priceCents: true, available: true },
  });
  const quote = quoteOrder(data.cart, catalog, store, data.fulfillment);
  if (!quote.ok) return quote;

  const online = data.paymentMethod === "ONLINE_PIX" || data.paymentMethod === "ONLINE_CARD";
  if (online) {
    const methods = onlineMethods(store);
    if (data.paymentMethod === "ONLINE_PIX" ? !methods.pix : !methods.card)
      return { ok: false, error: "Esta forma de pagamento não está disponível. Escolha outra." };
    if (!normalizeCpfCnpj(data.cpfCnpj ?? "")) return { ok: false, error: "Informe um CPF válido para pagar online." };
  }

  const { customer: known, trusted, isNew } = await resolveCustomer(store, phone);

  // Um desconto por pedido: a recompensa de fidelidade (só para o cliente logado) ou um cupom.
  let discount = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  let loyaltyReward = false;
  if (data.useReward) {
    const status = trusted && known ? await getLoyaltyStatus(store, known.id) : null;
    if (!status?.rewardAvailable) return { ok: false, error: "A recompensa de fidelidade não está disponível." };
    discount = discountCents(quote.subtotalCents, { type: store.loyaltyRewardType, value: store.loyaltyRewardValue });
    loyaltyReward = true;
  } else if (data.couponCode?.trim()) {
    const { coupon, check } = await evaluateCoupon(store.id, data.couponCode, known?.id ?? null, quote.subtotalCents);
    if (!check.ok || !coupon) return { ok: false, error: check.ok ? "Cupom inválido." : check.error };
    discount = check.discountCents;
    couponId = coupon.id;
    couponCode = coupon.code;
  }

  if (online && quote.totalCents - discount < MIN_ONLINE_PAYMENT_CENTS)
    return { ok: false, error: "Pagamento online só a partir de R$ 5,00. Escolha outra forma de pagamento." };

  const changeForCents =
    data.paymentMethod === "CASH" && data.changeFor ? parseBRLToCents(data.changeFor) : null;
  const address = data.fulfillment === "DELIVERY" ? data.address!.replace(/\s+/g, " ").trim() : null;

  // Número sequencial por loja. Em caso de corrida, a constraint única
  // (storeId, number) falha e tentamos de novo.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await db.$transaction(async (tx) => {
        let customerId = known?.id;
        if (isNew) {
          const created = await tx.customer.upsert({
            where: { storeId_phone: { storeId: store.id, phone } },
            update: {},
            create: { storeId: store.id, phone, name: data.customerName, marketingOptIn: !!data.marketingOptIn },
          });
          customerId = created.id;
        } else if (trusted && known) {
          await tx.customer.update({
            where: { id: known.id },
            data: { name: data.customerName, ...(data.marketingOptIn ? { marketingOptIn: true } : {}) },
          });
        }
        // Endereço só é salvo na conta quando o aparelho é do próprio cliente.
        if (trusted && customerId && address) {
          await tx.customerAddress.upsert({
            where: { customerId_address: { customerId, address } },
            update: { lastUsedAt: new Date() },
            create: { customerId, address },
          });
        }
        const last = await tx.order.findFirst({ where: { storeId: store.id }, orderBy: { number: "desc" }, select: { number: true } });
        return tx.order.create({
          data: {
            storeId: store.id,
            number: (last?.number ?? 0) + 1,
            fulfillment: data.fulfillment,
            paymentMethod: data.paymentMethod,
            // Pedido pago online só aparece para a loja depois que o pagamento é confirmado.
            paymentStatus: online ? "AWAITING" : "NONE",
            changeForCents,
            customerId,
            customerName: data.customerName,
            customerPhone: phone,
            address,
            notes: data.notes || null,
            subtotalCents: quote.subtotalCents,
            deliveryFeeCents: quote.deliveryFeeCents,
            discountCents: discount,
            couponId,
            couponCode,
            loyaltyReward,
            totalCents: quote.totalCents - discount,
            items: { create: quote.lines.map((l) => ({ productId: l.productId, name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity, notes: l.notes })) },
          },
        });
      });
      // Primeiro pedido com este telefone: o aparelho fica logado como esse cliente.
      if (isNew && order.customerId) await setCustomerSession(store.id, order.customerId);
      if (online) {
        const payment = await createOrderPayment(order.id, data.cpfCnpj ?? "");
        if (!payment.ok) return payment;
      }
      return { ok: true, orderId: order.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "Não foi possível registrar o pedido. Tente de novo." };
}

export type CouponPreview = { ok: true; code: string; discountCents: number } | { ok: false; error: string };

/** Pré-visualização do cupom na sacola. O pedido valida tudo de novo. */
export async function previewCoupon(slug: string, code: string, subtotalCents: number, phoneInput: string): Promise<CouponPreview> {
  if (!code.trim()) return { ok: false, error: "Digite o código do cupom." };
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) return { ok: false, error: "Loja não encontrada." };
  const phone = normalizePhone(phoneInput);
  const customer = isValidPhone(phone)
    ? await db.customer.findUnique({ where: { storeId_phone: { storeId: store.id, phone } }, select: { id: true } })
    : (await getSessionCustomer(store.id));
  const { coupon, check } = await evaluateCoupon(store.id, code, customer?.id ?? null, Math.max(0, Math.floor(subtotalCents)));
  if (!check.ok || !coupon) return { ok: false, error: check.ok ? "Cupom inválido." : check.error };
  return { ok: true, code: coupon.code, discountCents: check.discountCents };
}

// --- Conta do cliente ---

export type AccountState = { error?: string; ok?: boolean } | undefined;

const MAX_PIN_FAILURES = 5;
const LOCK_MINUTES = 15;

/**
 * Entrar em outro aparelho com telefone + PIN (criado em "Minha conta")
 * ou + código de acesso de uso único (a loja envia pelo WhatsApp, pelo painel).
 * Os dois dividem o mesmo limite de tentativas.
 */
export async function customerLogin(_: AccountState, formData: FormData): Promise<AccountState> {
  const slug = String(formData.get("slug") ?? "");
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const secret = String(formData.get("pin") ?? "").replace(/\D/g, "");
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) return { error: "Loja não encontrada." };
  const generic = {
    error: "Telefone, PIN ou código incorretos. Se você ainda não criou um PIN, peça um código de acesso para a loja pelo WhatsApp.",
  };

  const customer = isValidPhone(phone) ? await db.customer.findUnique({ where: { storeId_phone: { storeId: store.id, phone } } }) : null;
  if (!customer) return generic;
  if (customer.pinLockedUntil && customer.pinLockedUntil > new Date())
    return { error: `Muitas tentativas. Tente de novo em ${LOCK_MINUTES} minutos.` };

  const codeValid = !!customer.loginCodeHash && !!customer.loginCodeExpiresAt && customer.loginCodeExpiresAt > new Date();
  const byCode = codeValid && (await verifyPassword(secret, customer.loginCodeHash!));
  const byPin = !byCode && !!customer.pinHash && (await verifyPassword(secret, customer.pinHash));

  if (!byCode && !byPin) {
    if (!customer.pinHash && !codeValid) return generic; // nada para adivinhar: não conta tentativa
    const failures = customer.pinFailures + 1;
    await db.customer.update({
      where: { id: customer.id },
      data: failures >= MAX_PIN_FAILURES
        ? { pinFailures: 0, pinLockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
        : { pinFailures: failures },
    });
    return generic;
  }
  await db.customer.update({
    where: { id: customer.id },
    data: { pinFailures: 0, pinLockedUntil: null, ...(byCode ? { loginCodeHash: null, loginCodeExpiresAt: null } : {}) },
  });
  await setCustomerSession(store.id, customer.id);
  revalidatePath(`/loja/${slug}`, "layout");
  return { ok: true };
}

async function currentCustomer(slug: string) {
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) return null;
  const customer = await getSessionCustomer(store.id);
  return customer ? { store, customer } : null;
}

export async function customerLogout(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const store = await db.store.findUnique({ where: { slug } });
  if (store) await clearCustomerSession(store.id);
  revalidatePath(`/loja/${slug}`, "layout");
}

export async function setCustomerPin(_: AccountState, formData: FormData): Promise<AccountState> {
  const ctx = await currentCustomer(String(formData.get("slug") ?? ""));
  if (!ctx) return { error: "Sessão expirada." };
  const pin = String(formData.get("pin") ?? "");
  if (!/^\d{4,6}$/.test(pin)) return { error: "O PIN deve ter de 4 a 6 números." };
  if (pin !== String(formData.get("pin2") ?? "")) return { error: "Os PINs não conferem." };
  await db.customer.update({ where: { id: ctx.customer.id }, data: { pinHash: await hashPassword(pin), pinFailures: 0, pinLockedUntil: null } });
  return { ok: true };
}

export async function updateCustomerProfile(_: AccountState, formData: FormData): Promise<AccountState> {
  const slug = String(formData.get("slug") ?? "");
  const ctx = await currentCustomer(slug);
  if (!ctx) return { error: "Sessão expirada." };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Informe seu nome." };
  await db.customer.update({
    where: { id: ctx.customer.id },
    data: { name: name.slice(0, 100), marketingOptIn: formData.get("marketingOptIn") === "on" },
  });
  revalidatePath(`/loja/${slug}/conta`);
  return { ok: true };
}

export async function deleteCustomerAddress(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const ctx = await currentCustomer(slug);
  if (!ctx) return;
  await db.customerAddress.deleteMany({ where: { id: String(formData.get("id")), customerId: ctx.customer.id } });
  revalidatePath(`/loja/${slug}/conta`);
}

// --- Pagamento online ---

/** O cliente desistiu de pagar online: cancela o pedido para poder refazer com outra forma. */
export async function cancelUnpaidOrder(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const order = await db.order.findFirst({ where: { id: String(formData.get("orderId") ?? ""), store: { slug } }, include: { store: true } });
  if (order) await cancelAwaitingOrder(order);
  revalidatePath(`/loja/${slug}/pedido/${order?.id}`);
}
