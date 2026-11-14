import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { statusLabel, storeSituation } from "@/lib/subscription";
import { SituationBadge } from "@/components/SituationBadge";
import { AdminActionForm } from "@/components/AdminForms";
import { blockStore, changePlan, enterAsSupport, grantDays, resetPassword, unblockStore } from "../../actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const fmt = (d: Date | null | undefined) => (d && d.getTime() > 0 ? dateFmt.format(d) : "—");

const eventLabel: Record<string, string> = {
  PAYMENT_CREATED: "Cobrança criada",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_RECEIVED: "Pagamento recebido",
  PAYMENT_OVERDUE: "Cobrança vencida",
  PAYMENT_REFUNDED: "Pagamento estornado",
  PAYMENT_DELETED: "Cobrança removida",
  SUBSCRIPTION_CREATED: "Assinatura criada",
  SUBSCRIPTION_UPDATED: "Assinatura alterada",
  SUBSCRIPTION_DELETED: "Assinatura removida",
  SUBSCRIPTION_INACTIVATED: "Assinatura inativada",
};

export default async function StoreDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [store, plans, month, lastOrder, events, logs] = await Promise.all([
    db.store.findUnique({
      where: { id },
      include: { plan: true, users: { orderBy: { createdAt: "asc" } }, _count: { select: { products: true, orders: true } } },
    }),
    db.plan.findMany({ where: { active: true }, orderBy: { priceCents: "asc" } }),
    db.order.aggregate({ where: { storeId: id, createdAt: { gte: monthAgo }, status: { not: "CANCELED" } }, _count: true, _sum: { totalCents: true } }),
    db.order.findFirst({ where: { storeId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.billingEvent.findMany({ where: { storeId: id }, orderBy: { receivedAt: "desc" }, take: 20 }),
    db.adminLog.findMany({ where: { storeId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  if (!store) notFound();
  const hidden = { storeId: store.id };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/lojas" className="text-sm text-stone-500 hover:underline">← Lojas</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">
            {store.name}
            {store.isDemo && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-medium text-amber-900">Loja demo</span>}
          </h1>
          <SituationBadge situation={storeSituation(store)} />
          <a href={`/loja/${store.slug}`} target="_blank" className="text-sm text-brand-700 hover:underline">Ver cardápio</a>
          <form action={enterAsSupport} className="ml-auto">
            <input type="hidden" name="storeId" value={store.id} />
            <button className="btn-ghost">Entrar no painel como suporte</button>
          </form>
        </div>
        {store.blockedAt && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            Bloqueada em {fmt(store.blockedAt)}{store.blockedReason ? `: ${store.blockedReason}` : ""}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card"><p className="text-sm text-stone-500">Produtos</p><p className="text-2xl font-bold">{store._count.products}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Pedidos (total)</p><p className="text-2xl font-bold">{store._count.orders}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Pedidos (30 dias)</p><p className="text-2xl font-bold">{month._count}</p><p className="text-xs text-stone-500">{formatBRL(month._sum.totalCents ?? 0)} vendidos</p></div>
        <div className="card"><p className="text-sm text-stone-500">Último pedido</p><p className="text-2xl font-bold">{fmt(lastOrder?.createdAt)}</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-2 text-sm">
          <h2 className="text-base font-semibold">Dados da loja</h2>
          <p><span className="text-stone-500">Cadastro:</span> {fmt(store.createdAt)}</p>
          <p><span className="text-stone-500">WhatsApp:</span> {store.whatsapp ?? "—"}</p>
          <p><span className="text-stone-500">Endereço:</span> {store.address ?? "—"}</p>
          <p><span className="text-stone-500">CPF/CNPJ:</span> {store.cpfCnpj ?? "—"}</p>
          <p><span className="text-stone-500">Recebendo pedidos:</span> {store.isOpen ? "aberta pelo lojista" : "fechada pelo lojista"}</p>
        </section>

        <section className="card space-y-2 text-sm">
          <h2 className="text-base font-semibold">Assinatura</h2>
          <p><span className="text-stone-500">Plano:</span> {store.plan.name} ({formatBRL(store.plan.priceCents)}/mês)</p>
          <p><span className="text-stone-500">Situação da cobrança:</span> {statusLabel[store.subscriptionStatus]}</p>
          <p><span className="text-stone-500">Acesso liberado até (teste/cortesia):</span> {fmt(store.trialEndsAt)}</p>
          <p><span className="text-stone-500">Período pago até:</span> {fmt(store.currentPeriodEnd)}</p>
          <p><span className="text-stone-500">Cliente no Asaas:</span> {store.billingCustomerId ?? "—"}</p>
          <p><span className="text-stone-500">Assinatura no Asaas:</span> {store.billingSubscriptionId ?? "—"}</p>
        </section>
      </div>

      <section className="card space-y-5">
        <h2 className="font-semibold">Ações</h2>
        {store.blockedAt ? (
          <AdminActionForm action={unblockStore} hidden={hidden}>
            <button className="btn">Desbloquear loja</button>
          </AdminActionForm>
        ) : (
          <AdminActionForm action={blockStore} hidden={hidden} confirmText="Bloquear esta loja? Ela para de receber pedidos na hora.">
            <div><label className="label">Motivo do bloqueio (o lojista vê)</label><input name="reason" className="input w-72" placeholder="Opcional" /></div>
            <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Bloquear loja</button>
          </AdminActionForm>
        )}
        <AdminActionForm action={grantDays} hidden={hidden}>
          <div><label className="label">Liberar acesso por (dias)</label><input name="days" type="number" min={1} max={365} defaultValue={7} className="input w-28" /></div>
          <button className="btn-ghost">Liberar</button>
        </AdminActionForm>
        <AdminActionForm action={changePlan} hidden={hidden}>
          <div>
            <label className="label">Trocar plano</label>
            <select name="planCode" defaultValue={store.plan.code} className="input w-64">
              {plans.map((p) => <option key={p.code} value={p.code}>{p.name} ({formatBRL(p.priceCents)})</option>)}
            </select>
          </div>
          <button className="btn-ghost">Trocar</button>
        </AdminActionForm>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Usuários da loja</h2>
        <ul className="divide-y divide-stone-100 text-sm">
          {store.users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-[220px] flex-1"><p className="font-medium">{u.name}</p><p className="text-stone-500">{u.email}</p></div>
              <AdminActionForm action={resetPassword} hidden={{ userId: u.id }} confirmText={`Gerar uma senha nova para ${u.email}? A senha atual deixa de funcionar.`}>
                <button className="btn-ghost">Redefinir senha</button>
              </AdminActionForm>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Eventos de cobrança (Asaas)</h2>
          {events.length === 0 && <p className="text-sm text-stone-500">Nenhum evento recebido.</p>}
          <ul className="divide-y divide-stone-100 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-2"><span>{eventLabel[e.type] ?? e.type}</span><span className="text-stone-500">{dateTimeFmt.format(e.receivedAt)}</span></li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Histórico da administração</h2>
          {logs.length === 0 && <p className="text-sm text-stone-500">Nenhuma ação registrada.</p>}
          <ul className="divide-y divide-stone-100 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="py-2">
                <div className="flex justify-between gap-3"><span>{l.action}</span><span className="text-stone-500">{dateTimeFmt.format(l.createdAt)}</span></div>
                <p className="text-xs text-stone-500">{l.adminEmail}{l.detail ? ` · ${l.detail}` : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
