import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { statusLabel, trialDaysLeft } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const { store } = await requireStoreUser();
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { priceCents: "asc" } });
  const days = trialDaysLeft(store);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Assinatura</h1>
      <div className="card text-sm">
        <p>Plano atual: <strong>{store.plan.name}</strong> ({formatBRL(store.plan.priceCents)}/mês)</p>
        <p>Situação: <strong>{statusLabel[store.subscriptionStatus]}</strong>{days > 0 ? ` · ${days} dia(s) restantes` : ""}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={`card ${p.id === store.planId ? "ring-2 ring-brand-500" : ""}`}>
            <h2 className="font-semibold">{p.name}</h2>
            <p className="text-2xl font-bold">{formatBRL(p.priceCents)}<span className="text-sm font-normal">/mês</span></p>
            <p className="mt-2 text-sm text-stone-600">{p.maxProducts === 0 ? "Produtos ilimitados" : `Até ${p.maxProducts} produtos`}</p>
            {/* TODO: ligar ao gateway (Asaas / Mercado Pago / Stripe) em src/lib/billing.ts */}
            <button className="btn mt-4 w-full" disabled title="Pagamento ainda não integrado">
              {p.id === store.planId ? "Assinar este plano" : "Mudar para este plano"}
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-500">A cobrança recorrente (Pix/cartão) ainda não está integrada nesta versão.</p>
    </div>
  );
}
