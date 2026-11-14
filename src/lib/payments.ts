import "server-only";
import { Prisma, type Order, type Store } from "@prisma/client";
import { db } from "./db";
import * as asaas from "./asaas";
import { open, seal } from "./secret-box";
import { normalizeCpfCnpj } from "./cpf-cnpj";
import { MIN_ONLINE_PAYMENT_CENTS, SUBACCOUNT_WEBHOOK_EVENTS, eventForPaymentStatus, paymentUpdateFor } from "./payment-events";

// Pagamento online dos pedidos. Cada loja tem uma subconta no Asaas criada
// pela plataforma; as cobranças são criadas com a chave da subconta, então o
// dinheiro cai direto na conta da loja. A WebTenda não fica com nenhuma parte.

export function appUrl() {
  return (process.env.APP_URL || "https://app.webtenda.com.br").replace(/\/$/, "");
}

function storeKey(store: Pick<Store, "asaasApiKeyEnc">): string | null {
  if (!store.asaasApiKeyEnc) return null;
  try {
    return open(store.asaasApiKeyEnc);
  } catch {
    return null; // segredo trocado: a chave salva não abre mais
  }
}

function isoDateInSaoPaulo(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

const errorText = (e: unknown) => (e instanceof asaas.AsaasError ? e.message : "Erro inesperado ao falar com o Asaas.");

// --- Subconta da loja ---

export type SubaccountInput = Omit<asaas.NewSubaccount, "webhooks" | "site">;

export async function createStoreSubaccount(storeId: string, input: SubaccountInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!asaas.asaasConfigured()) return { ok: false, error: "O Asaas ainda não foi configurado neste servidor." };
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!token) return { ok: false, error: "Falta configurar ASAAS_WEBHOOK_TOKEN no servidor." };

  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) return { ok: false, error: "Loja não encontrada." };
  if (store.asaasAccountId) return { ok: false, error: "Esta loja já tem uma conta de recebimento." };

  try {
    const account = await asaas.createSubaccount({
      ...input,
      site: appUrl(),
      webhooks: [
        {
          name: "WebTenda - pedidos",
          url: `${appUrl()}/api/payments/webhook`,
          email: process.env.ASAAS_WEBHOOK_EMAIL || input.email,
          enabled: true,
          interrupted: false,
          apiVersion: 3,
          authToken: token,
          sendType: "SEQUENTIALLY",
          events: SUBACCOUNT_WEBHOOK_EVENTS,
        },
      ],
    });
    // A chave da subconta só vem agora: salva antes de qualquer outra coisa.
    await db.store.update({
      where: { id: store.id },
      data: {
        asaasAccountId: account.id,
        asaasWalletId: account.walletId,
        asaasApiKeyEnc: account.apiKey ? seal(account.apiKey) : null,
        asaasAccountStatus: "PENDING",
      },
    });
    if (!account.apiKey) return { ok: false, error: "O Asaas criou a conta mas não devolveu a chave de acesso. Fale com o suporte." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Não foi possível criar a conta: ${errorText(e)}` };
  }
}

export type AccountOverview = {
  status: asaas.AsaasAccountStatus | null;
  documents: asaas.AsaasDocumentGroup[];
  rejectReasons: string | null;
  error: string | null;
};

/** Consulta a situação da subconta (e documentos pendentes) e guarda a situação geral. */
export async function refreshAccount(store: Store): Promise<AccountOverview> {
  const key = storeKey(store);
  if (!key) return { status: null, documents: [], rejectReasons: null, error: store.asaasAccountId ? "Chave da conta indisponível." : null };
  try {
    const status = await asaas.getAccountStatus(key);
    if (status.general !== store.asaasAccountStatus)
      await db.store.update({ where: { id: store.id }, data: { asaasAccountStatus: status.general } });
    let documents: asaas.AsaasDocumentGroup[] = [];
    let rejectReasons: string | null = null;
    if (status.general !== "APPROVED") {
      const docs = await asaas.listPendingDocuments(key).catch(() => null);
      documents = (docs?.groups ?? []).filter((g) => g.status !== "APPROVED");
      rejectReasons = docs?.rejectReasons ?? null;
    }
    return { status, documents, rejectReasons, error: null };
  } catch (e) {
    return { status: null, documents: [], rejectReasons: null, error: errorText(e) };
  }
}

export async function setOnlineMethods(store: Store, pix: boolean, card: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = storeKey(store);
  if (!key) return { ok: false, error: "Crie a conta de recebimento primeiro." };
  if (pix) {
    try {
      await asaas.ensurePixKey(key);
    } catch (e) {
      return { ok: false, error: `Não foi possível preparar o Pix: ${errorText(e)}` };
    }
  }
  await db.store.update({ where: { id: store.id }, data: { onlinePixEnabled: pix, onlineCardEnabled: card } });
  return { ok: true };
}

// --- Cobrança dos pedidos ---

/** Formas online que a loja oferece agora no cardápio. */
export function onlineMethods(store: Pick<Store, "asaasApiKeyEnc" | "onlinePixEnabled" | "onlineCardEnabled">) {
  const ready = !!store.asaasApiKeyEnc && asaas.asaasConfigured();
  return { pix: ready && store.onlinePixEnabled, card: ready && store.onlineCardEnabled };
}

/**
 * Gera a cobrança do pedido na subconta da loja. Se falhar, o pedido é
 * cancelado (para não aparecer para a loja nem gastar o cupom).
 */
export async function createOrderPayment(orderId: string, cpfCnpjInput: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { store: true, customer: true } });
  if (!order || (order.paymentMethod !== "ONLINE_PIX" && order.paymentMethod !== "ONLINE_CARD")) return { ok: false, error: "Pedido inválido." };
  const fail = async (error: string) => {
    await db.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED", status: "CANCELED" } });
    return { ok: false as const, error };
  };
  const key = storeKey(order.store);
  const cpfCnpj = normalizeCpfCnpj(cpfCnpjInput);
  if (!key) return fail("Esta loja não está recebendo pagamentos online agora.");
  if (!cpfCnpj) return fail("Informe um CPF válido para pagar online.");
  if (order.totalCents < MIN_ONLINE_PAYMENT_CENTS) return fail("Pagamento online só a partir de R$ 5,00.");

  try {
    // Cliente na subconta da loja (reaproveitado nos próximos pedidos).
    let asaasCustomerId = order.customer?.asaasCustomerId ?? null;
    if (asaasCustomerId && order.customer?.cpfCnpj !== cpfCnpj) {
      await asaas.updateCustomerAs(key, asaasCustomerId, { cpfCnpj, name: order.customerName });
    } else if (!asaasCustomerId) {
      const created = await asaas.createCustomerAs(key, {
        name: order.customerName,
        cpfCnpj,
        mobilePhone: order.customerPhone,
        externalReference: order.customerId ?? order.id,
        notificationDisabled: true, // quem avisa o cliente é o cardápio, não o Asaas
      });
      asaasCustomerId = created.id;
    }
    if (order.customerId)
      await db.customer.update({ where: { id: order.customerId }, data: { asaasCustomerId, cpfCnpj } });

    const base = {
      customer: asaasCustomerId,
      billingType: order.paymentMethod === "ONLINE_PIX" ? ("PIX" as const) : ("CREDIT_CARD" as const),
      value: order.totalCents / 100,
      dueDate: isoDateInSaoPaulo(new Date()),
      description: `Pedido #${order.number} - ${order.store.name}`,
      externalReference: order.id,
    };
    const successUrl = `${appUrl()}/loja/${order.store.slug}/pedido/${order.id}`;
    let payment: asaas.AsaasPayment;
    try {
      payment = await asaas.createPaymentAs(key, { ...base, callback: { successUrl, autoRedirect: true } });
    } catch (e) {
      // O Asaas recusa o retorno automático se o domínio não estiver no cadastro da conta.
      if (!(e instanceof asaas.AsaasError) || e.status !== 400) throw e;
      payment = await asaas.createPaymentAs(key, base);
    }
    await db.order.update({
      where: { id: order.id },
      data: { paymentId: payment.id, paymentUrl: payment.invoiceUrl ?? null, paymentStatus: "AWAITING" },
    });
    return { ok: true };
  } catch (e) {
    return fail(`Não foi possível gerar o pagamento: ${errorText(e)} Tente outra forma de pagamento.`);
  }
}

/** Aplica um evento do Asaas ao pedido da cobrança. Devolve se mudou algo. */
export async function applyPaymentEvent(paymentId: string, event: string, eventId?: string): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { paymentId } });
      if (eventId) await tx.billingEvent.create({ data: { id: eventId, type: event, storeId: order?.storeId } });
      if (!order) return false;
      const update = paymentUpdateFor(event, order);
      if (!update) return false;
      // Só atualiza se a situação não mudou no meio do caminho.
      const res = await tx.order.updateMany({ where: { id: order.id, paymentStatus: order.paymentStatus }, data: update });
      return res.count > 0;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false; // evento repetido
    throw e;
  }
}

/** Consulta a cobrança no Asaas (caso o webhook atrase) e atualiza o pedido. */
export async function syncOrderPayment(order: Order & { store: Store }): Promise<void> {
  if (!order.paymentId || order.paymentStatus !== "AWAITING") return;
  const key = storeKey(order.store);
  if (!key) return;
  try {
    const payment = await asaas.getPaymentAs(key, order.paymentId);
    const event = eventForPaymentStatus(payment.status);
    if (event) await applyPaymentEvent(order.paymentId, event);
  } catch {}
}

export async function getPixQrCode(order: Order & { store: Store }) {
  const key = storeKey(order.store);
  if (!key || !order.paymentId) return null;
  try {
    return await asaas.getPixQrCodeAs(key, order.paymentId);
  } catch {
    return null;
  }
}

/** O cliente desistiu antes de pagar: apaga a cobrança e cancela o pedido. */
export async function cancelAwaitingOrder(order: Order & { store: Store }): Promise<{ ok: boolean; error?: string }> {
  if (order.paymentStatus !== "AWAITING") return { ok: false, error: "Este pedido não está esperando pagamento." };
  const key = storeKey(order.store);
  if (key && order.paymentId) {
    try {
      const payment = await asaas.getPaymentAs(key, order.paymentId);
      if (eventForPaymentStatus(payment.status) === "PAYMENT_RECEIVED" || eventForPaymentStatus(payment.status) === "PAYMENT_CONFIRMED") {
        await applyPaymentEvent(order.paymentId, eventForPaymentStatus(payment.status)!);
        return { ok: false, error: "O pagamento já foi feito, então o pedido seguiu para a loja." };
      }
      await asaas.deletePaymentAs(key, order.paymentId);
    } catch (e) {
      if (!(e instanceof asaas.AsaasError) || e.status !== 404) return { ok: false, error: errorText(e) };
    }
  }
  await db.order.updateMany({ where: { id: order.id, paymentStatus: "AWAITING" }, data: { paymentStatus: "EXPIRED", status: "CANCELED" } });
  return { ok: true };
}
