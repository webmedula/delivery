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
import { etaFor, resolveDeliveryFee } from "@/lib/delivery";
import { OutOfStockError, reserveStock } from "@/lib/stock";
import { formatShippingAddress, normalizeCep, resolveShipping } from "@/lib/shipping";
import { orderSummaryMessage, storeWhatsappLink } from "@/lib/order-message";
import { termsFor } from "@/lib/niche";
import { brDateTime, depositFor, validateSchedule } from "@/lib/preorder";
import { storeUrl } from "@/lib/store-url";
import { activeCall, isCallKind } from "@/lib/tables";
import { clearCustomerSession, getLoyaltyStatus, getSessionCustomer, setCustomerSession } from "@/lib/customers";

const schema = z.object({
  slug: z.string(),
  cart: z.array(z.object({ productId: z.string(), variantId: z.string().max(40).optional(), quantity: z.number().int(), notes: z.string().optional() })).max(50),
  customerName: z.string().trim().min(2, "Informe seu nome.").max(100),
  // Na mesa o telefone é opcional (o pedido vai pelo nome e pela mesa).
  customerPhone: z.string().trim().max(30),
  fulfillment: z.enum(["DELIVERY", "PICKUP", "SHIPPING", "TABLE"]),
  tableCode: z.string().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  shipping: z
    .object({
      cep: z.string().max(12),
      street: z.string().trim().max(120),
      number: z.string().trim().max(20),
      complement: z.string().trim().max(80).optional(),
      district: z.string().trim().max(80),
      city: z.string().trim().max(80),
      methodId: z.string().max(40),
    })
    .optional(),
  deliveryZoneId: z.string().max(40).optional(),
  paymentMethod: z.enum(["WHATSAPP", "PIX", "CASH", "CARD_ON_DELIVERY", "ONLINE_PIX", "ONLINE_CARD", "TAB"]),
  cpfCnpj: z.string().max(20).optional(),
  changeFor: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  couponCode: z.string().max(40).optional(),
  useReward: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
  /** Encomenda: dia ("2026-11-21") e horário ("14:00") escolhidos. */
  schedule: z.object({ date: z.string().max(10), time: z.string().max(5) }).optional(),
});

/** Encomendas já marcadas para o dia (Brasília), para o limite diário da loja. */
async function countScheduledOn(storeId: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const start = brDateTime(date, "00:00");
  return db.order.count({
    where: { storeId, scheduledFor: { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60_000) }, status: { not: "CANCELED" } },
  });
}

export type PlaceOrderResult =
  | { ok: true; orderId: string; /** Pedido para fechar no WhatsApp: abrir este link com a mensagem pronta. */ whatsappUrl?: string }
  | { ok: false; error: string };

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

  const atTable = data.fulfillment === "TABLE";
  const phone = normalizePhone(data.customerPhone);
  // Na mesa, sem telefone o pedido não fica ligado a um cliente (não conta selo de fidelidade).
  const anonymous = atTable && phone === "";
  if (!anonymous && phone.length < 8) return { ok: false, error: "Informe seu telefone." };
  if (!anonymous && !isValidPhone(phone)) return { ok: false, error: "Telefone inválido. Use DDD + número, ex.: (11) 98888-7777." };

  const store = await db.store.findUnique({ where: { slug: data.slug }, include: { plan: true, deliveryZones: true, shippingMethods: true } });
  if (!store) return { ok: false, error: "Loja não encontrada." };
  if (!store.isOpen || !canTakeOrders(store)) return { ok: false, error: "A loja não está recebendo pedidos agora." };
  if (data.fulfillment === "DELIVERY" && !data.address) return { ok: false, error: "Informe o endereço de entrega." };
  const table = atTable
    ? await db.diningTable.findFirst({ where: { storeId: store.id, code: data.tableCode ?? "", active: true } })
    : null;
  if (atTable && !table) return { ok: false, error: "Esta mesa não está recebendo pedidos pelo celular. Chame o garçom." };
  const ship = data.fulfillment === "SHIPPING" ? data.shipping : undefined;
  if (data.fulfillment === "SHIPPING") {
    if (!ship) return { ok: false, error: "Informe o endereço de envio." };
    if (!normalizeCep(ship.cep)) return { ok: false, error: "CEP inválido. Confira os 8 números." };
    if (!ship.street || !ship.number || !ship.district || !ship.city) return { ok: false, error: "Preencha rua, número, bairro e cidade." };
  }

  if (store.plan.maxOrdersMonth > 0) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const count = await db.order.count({ where: { storeId: store.id, createdAt: { gte: monthStart }, paymentStatus: { not: "FAILED" } } });
    if (count >= store.plan.maxOrdersMonth) return { ok: false, error: "A loja não está recebendo pedidos agora." };
  }

  const catalog = await db.product.findMany({
    where: { storeId: store.id, id: { in: data.cart.map((c) => c.productId) } },
    select: {
      id: true, name: true, priceCents: true, available: true, stock: true,
      variants: { select: { id: true, color: true, size: true, stock: true, priceCents: true, active: true } },
    },
  });
  // Taxa por bairro (se a loja cadastrou bairros) ou a taxa única da loja.
  const fee = data.fulfillment === "DELIVERY" ? resolveDeliveryFee(store.deliveryZones, data.deliveryZoneId, store.deliveryFeeCents) : null;
  if (fee && !fee.ok) return fee;
  const zone = fee?.ok ? fee.zone : null;
  // Envio: o frete depende do CEP e do subtotal (frete grátis acima de um valor).
  let shipping: ReturnType<typeof resolveShipping> | null = null;
  if (ship) {
    const base = quoteOrder(data.cart, catalog, { ...store, deliveryFeeCents: 0 }, "SHIPPING");
    if (!base.ok) return base;
    shipping = resolveShipping(store.shippingMethods, { originUf: store.shippingOriginUf, freeAboveCents: store.shippingFreeAboveCents }, ship.cep, ship.methodId, base.subtotalCents);
    if (!shipping.ok) return shipping;
  }
  const feeCents = shipping?.ok ? shipping.option.feeCents : fee?.ok ? fee.feeCents : store.deliveryFeeCents;
  const quote = quoteOrder(data.cart, catalog, { ...store, deliveryFeeCents: feeCents }, data.fulfillment);
  if (!quote.ok) return quote;

  // Encomenda: dia e horário dentro das regras da loja (antecedência, dias da semana, limite por dia).
  const preorder = store.businessType === "PREORDER";
  let scheduledFor: Date | null = null;
  if (preorder) {
    const date = data.schedule?.date;
    const taken = date ? await countScheduledOn(store.id, date) : 0;
    const check = validateSchedule(store, date, data.schedule?.time, new Date(), taken);
    if (!check.ok) return check;
    scheduledFor = check.scheduledFor;
    if (store.depositPercent > 0 && (data.paymentMethod === "CASH" || data.paymentMethod === "CARD_ON_DELIVERY"))
      return { ok: false, error: "Esta loja cobra um sinal para confirmar a encomenda. Escolha Pix, cartão online ou combinar pelo WhatsApp." };
  }

  if (data.fulfillment === "SHIPPING" && (data.paymentMethod === "CASH" || data.paymentMethod === "CARD_ON_DELIVERY"))
    return { ok: false, error: "Para envio, escolha Pix, cartão online ou combinar pelo WhatsApp." };
  // Na mesa: entra na conta da mesa ou paga agora online. Fora da mesa não existe "conta".
  if (atTable ? !["TAB", "ONLINE_PIX", "ONLINE_CARD"].includes(data.paymentMethod) : data.paymentMethod === "TAB")
    return { ok: false, error: "Esta forma de pagamento não está disponível. Escolha outra." };
  if (data.paymentMethod === "WHATSAPP" && !(store.whatsappCheckout && store.whatsapp))
    return { ok: false, error: "Esta forma de pagamento não está disponível. Escolha outra." };
  const online = data.paymentMethod === "ONLINE_PIX" || data.paymentMethod === "ONLINE_CARD";
  if (online) {
    const methods = onlineMethods(store);
    if (data.paymentMethod === "ONLINE_PIX" ? !methods.pix : !methods.card)
      return { ok: false, error: "Esta forma de pagamento não está disponível. Escolha outra." };
    if (!normalizeCpfCnpj(data.cpfCnpj ?? "")) return { ok: false, error: "Informe um CPF válido para pagar online." };
  }

  const { customer: known, trusted, isNew } = anonymous
    ? { customer: null, trusted: false, isNew: false }
    : await resolveCustomer(store, phone);

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

  // Sinal da encomenda (o resto é pago na retirada). Pagando online, a cobrança é só do sinal.
  const depositCents = preorder ? depositFor(quote.totalCents - discount, store.depositPercent) : null;
  if (online && (depositCents ?? quote.totalCents - discount) < MIN_ONLINE_PAYMENT_CENTS)
    return { ok: false, error: "Pagamento online só a partir de R$ 5,00. Escolha outra forma de pagamento." };

  const changeForCents =
    data.paymentMethod === "CASH" && data.changeFor ? parseBRLToCents(data.changeFor) : null;
  const address =
    data.fulfillment === "DELIVERY"
      ? data.address!.replace(/\s+/g, " ").trim()
      : ship && shipping?.ok
        ? formatShippingAddress({ ...ship, cep: normalizeCep(ship.cep)!, uf: shipping.uf })
        : null;
  const shipped = shipping?.ok ? shipping : null;
  const eta = etaFor(store, data.fulfillment);

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
        if (trusted && customerId && address && data.fulfillment === "DELIVERY") {
          await tx.customerAddress.upsert({
            where: { customerId_address: { customerId, address } },
            update: { lastUsedAt: new Date() },
            create: { customerId, address },
          });
        }
        // Desconta as peças do estoque aqui, para duas pessoas não levarem a última ao mesmo tempo.
        const stockReserved = await reserveStock(tx, store.id, quote.lines);
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
            deliveryZoneId: zone?.id ?? null,
            deliveryZoneName: zone?.name ?? null,
            shippingMethodId: shipped?.option.id ?? null,
            shippingMethodName: shipped?.option.name ?? null,
            shippingCep: ship ? normalizeCep(ship.cep) : null,
            shippingUf: shipped?.uf ?? null,
            shippingDaysMin: shipped?.option.daysMin ?? null,
            shippingDaysMax: shipped?.option.daysMax ?? null,
            tableId: table?.id ?? null,
            tableLabel: table?.label ?? null,
            etaMinutesMin: eta?.min ?? null,
            etaMinutesMax: eta?.max ?? null,
            notes: data.notes || null,
            subtotalCents: quote.subtotalCents,
            deliveryFeeCents: quote.deliveryFeeCents,
            discountCents: discount,
            couponId,
            couponCode,
            loyaltyReward,
            totalCents: quote.totalCents - discount,
            stockReserved,
            scheduledFor,
            depositCents,
            items: {
              create: quote.lines.map((l) => ({
                productId: l.productId, variantId: l.variantId ?? null, variantLabel: l.variantLabel ?? null,
                name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity, notes: l.notes,
              })),
            },
          },
          include: { items: true },
        });
      });
      // Primeiro pedido com este telefone: o aparelho fica logado como esse cliente.
      if (isNew && order.customerId) await setCustomerSession(store.id, order.customerId);
      if (online) {
        const payment = await createOrderPayment(order.id, data.cpfCnpj ?? "");
        if (!payment.ok) return payment;
      }
      if (data.paymentMethod === "WHATSAPP" && store.whatsapp) {
        const trackingUrl = `${await storeUrl(store.slug)}/pedido/${order.id}`;
        const text = orderSummaryMessage(order, { trackingUrl, catalogWord: termsFor(store.businessType).catalogLower });
        return { ok: true, orderId: order.id, whatsappUrl: storeWhatsappLink(store.whatsapp, text) };
      }
      return { ok: true, orderId: order.id };
    } catch (e) {
      if (e instanceof OutOfStockError) return { ok: false, error: e.message };
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

// --- Pedido na mesa ---

/** Cliente na mesa chama o garçom ou pede a conta. Aparece no quadro de pedidos com aviso sonoro. */
export async function callFromTable(slug: string, code: string, kind: string): Promise<{ ok: boolean; error?: string }> {
  if (!isCallKind(kind)) return { ok: false };
  const table = await db.diningTable.findFirst({ where: { code, active: true, store: { slug } } });
  if (!table) return { ok: false, error: "Mesa não encontrada. Chame o garçom." };
  // Pedir a conta tem prioridade sobre chamar o garçom, se os dois forem pedidos.
  const kindToSave = table.callKind === "BILL" && activeCall(table) ? "BILL" : kind;
  await db.diningTable.update({ where: { id: table.id }, data: { callKind: kindToSave, calledAt: new Date() } });
  revalidatePath("/painel");
  return { ok: true };
}
