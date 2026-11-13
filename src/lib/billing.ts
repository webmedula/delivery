import "server-only";
import { db } from "./db";
import * as asaas from "./asaas";
import { normalizeCpfCnpj } from "./cpf-cnpj";

export type SubscribeResult = { ok: true; invoiceUrl: string | null } | { ok: false; error: string };

/** Data de hoje no fuso de São Paulo, em YYYY-MM-DD. */
function isoDateInSaoPaulo(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

/**
 * Assina (ou troca de) plano. Cria cliente e assinatura no Asaas quando ainda
 * não existem e devolve o link da fatura em aberto para o lojista pagar.
 * A loja só vira ACTIVE quando o webhook confirma o pagamento.
 */
export async function subscribeStore(storeId: string, planCode: string, cpfCnpjInput: string): Promise<SubscribeResult> {
  if (!asaas.asaasConfigured()) return { ok: false, error: "A cobrança ainda não foi configurada neste servidor." };

  const store = await db.store.findUnique({
    where: { id: storeId },
    include: { users: { where: { role: "OWNER" }, take: 1 }, _count: { select: { products: true } } },
  });
  const plan = await db.plan.findFirst({ where: { code: planCode, active: true } });
  if (!store || !plan) return { ok: false, error: "Plano não encontrado." };

  const cpfCnpj = normalizeCpfCnpj(cpfCnpjInput || store.cpfCnpj || "");
  if (!cpfCnpj) return { ok: false, error: "Informe um CPF ou CNPJ válido." };

  if (plan.maxProducts > 0 && store._count.products > plan.maxProducts)
    return { ok: false, error: `Este plano permite até ${plan.maxProducts} produtos e sua loja tem ${store._count.products}.` };

  const owner = store.users[0];
  if (!owner) return { ok: false, error: "Loja sem responsável cadastrado." };

  try {
    let customerId = store.billingCustomerId;
    if (!customerId) {
      const customer = await asaas.createCustomer({
        name: store.name,
        email: owner.email,
        cpfCnpj,
        mobilePhone: store.whatsapp?.replace(/^55/, "") || undefined,
        externalReference: store.id,
      });
      customerId = customer.id;
      // Salva já, para não criar cliente duplicado se o próximo passo falhar.
      await db.store.update({ where: { id: store.id }, data: { billingCustomerId: customerId, cpfCnpj } });
    } else if (cpfCnpj !== store.cpfCnpj) {
      await asaas.updateCustomer(customerId, { cpfCnpj });
      await db.store.update({ where: { id: store.id }, data: { cpfCnpj } });
    }

    const value = plan.priceCents / 100;
    const description = `Assinatura ${plan.name} - ${store.name}`;
    let subscriptionId = store.billingSubscriptionId;

    if (subscriptionId) {
      await asaas.updateSubscription(subscriptionId, { value, description });
      await db.store.update({ where: { id: store.id }, data: { planId: plan.id } });
    } else {
      // Quem ainda está no teste só paga quando o teste acabar.
      const now = new Date();
      const firstDue = store.trialEndsAt && store.trialEndsAt > now ? store.trialEndsAt : now;
      const subscription = await asaas.createSubscription({
        customer: customerId,
        value,
        nextDueDate: isoDateInSaoPaulo(firstDue),
        description,
        externalReference: store.id,
      });
      subscriptionId = subscription.id;
      await db.store.update({
        where: { id: store.id },
        data: { planId: plan.id, billingSubscriptionId: subscriptionId },
      });
    }

    return { ok: true, invoiceUrl: await openInvoiceUrl(subscriptionId) };
  } catch (e) {
    if (e instanceof asaas.AsaasError) return { ok: false, error: `Não foi possível gerar a cobrança: ${e.message}` };
    throw e;
  }
}

/** Link da fatura em aberto mais antiga da assinatura, se houver. */
export async function openInvoiceUrl(subscriptionId: string): Promise<string | null> {
  const payments = await asaas.listSubscriptionPayments(subscriptionId);
  const open = payments
    .filter((p) => (p.status === "PENDING" || p.status === "OVERDUE") && p.invoiceUrl)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return open[0]?.invoiceUrl ?? null;
}

export async function cancelStoreSubscription(storeId: string): Promise<{ ok: boolean; error?: string }> {
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store?.billingSubscriptionId) return { ok: false, error: "Não há assinatura ativa." };
  try {
    await asaas.cancelSubscription(store.billingSubscriptionId);
  } catch (e) {
    // 404 = já não existe no Asaas; segue e limpa do nosso lado.
    if (!(e instanceof asaas.AsaasError) || e.status !== 404)
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao cancelar." };
  }
  await db.store.update({
    where: { id: store.id },
    data: { subscriptionStatus: "CANCELED", billingSubscriptionId: null },
  });
  return { ok: true };
}
