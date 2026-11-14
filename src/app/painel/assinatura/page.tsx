import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { statusLabel, trialDaysLeft } from "@/lib/subscription";
import { asaasConfigured } from "@/lib/asaas";
import { openInvoiceUrl } from "@/lib/billing";
import { CancelButton, PlanPicker } from "@/components/BillingForms";
import { DemoNotice } from "@/components/DemoNotice";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function SubscriptionPage() {
  const { store } = await requireStoreUser();
  if (store.isDemo) return <DemoNotice title="Assinatura" text="Lojas de demonstração não têm cobrança: a assinatura fica sempre ativa e os planos não podem ser contratados por aqui." />;
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { priceCents: "asc" } });
  const days = trialDaysLeft(store);
  const enabled = asaasConfigured();

  let invoiceUrl: string | null = null;
  if (enabled && store.billingSubscriptionId && store.subscriptionStatus !== "ACTIVE") {
    try {
      invoiceUrl = await openInvoiceUrl(store.billingSubscriptionId);
    } catch {}
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Assinatura</h1>
      <div className="card space-y-1 text-sm">
        <p>Plano atual: <strong>{store.plan.name}</strong> ({formatBRL(store.plan.priceCents)}/mês)</p>
        <p>Situação: <strong>{statusLabel[store.subscriptionStatus]}</strong>{days > 0 ? ` · ${days} dia(s) de teste restantes` : ""}</p>
        {store.currentPeriodEnd && store.currentPeriodEnd.getTime() > 0 && (
          <p>{store.subscriptionStatus === "ACTIVE" ? "Próxima renovação" : "Válida até"}: {dateFmt.format(store.currentPeriodEnd)}</p>
        )}
        {invoiceUrl && <a href={invoiceUrl} target="_blank" className="btn mt-3">Pagar fatura em aberto</a>}
        {store.billingSubscriptionId && <div className="pt-3"><CancelButton /></div>}
      </div>
      {!enabled && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          A cobrança ainda não foi configurada neste servidor (falta ASAAS_API_KEY).
        </p>
      )}
      <PlanPicker
        plans={plans.map((p) => ({ code: p.code, name: p.name, priceCents: p.priceCents, maxProducts: p.maxProducts, maxOrdersMonth: p.maxOrdersMonth }))}
        currentCode={store.plan.code}
        hasSubscription={!!store.billingSubscriptionId}
        cpfCnpj={store.cpfCnpj ?? ""}
        enabled={enabled}
      />
    </div>
  );
}
