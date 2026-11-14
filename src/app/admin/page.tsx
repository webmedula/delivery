import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { summarizeStores } from "@/lib/admin-stats";
import { situationLabel, storeSituation, type StoreSituation } from "@/lib/subscription";
import { SituationBadge } from "@/components/SituationBadge";
import { AdminActionForm } from "@/components/AdminForms";
import { deleteDemoStores, resetDemoStores } from "./actions";
import { DEFAULT_DEMO_PASSWORD } from "../../../prisma/demo";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const ORDER: StoreSituation[] = ["ACTIVE", "TRIAL", "PAST_DUE", "TRIAL_EXPIRED", "CANCELED", "BLOCKED"];

export default async function AdminHome() {
  await requireAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [stores, newStores, weekOrders, recent] = await Promise.all([
    // Lojas demo ficam fora dos números (ver prisma/demo.ts).
    db.store.findMany({ where: { isDemo: false }, include: { plan: true } }),
    db.store.count({ where: { createdAt: { gte: weekAgo }, isDemo: false } }),
    db.order.aggregate({
      where: { createdAt: { gte: weekAgo }, status: { not: "CANCELED" }, store: { isDemo: false } },
      _count: true,
      _sum: { totalCents: true },
    }),
    db.store.findMany({ where: { isDemo: false }, orderBy: { createdAt: "desc" }, take: 8, include: { plan: true } }),
  ]);
  const demos = await db.store.findMany({ where: { isDemo: true }, include: { users: { take: 1 } }, orderBy: { name: "asc" } });
  const summary = summarizeStores(stores);

  const cards = [
    { label: "Lojas cadastradas", value: String(summary.total) },
    { label: "Receita mensal prevista", value: formatBRL(summary.mrrCents), hint: "soma dos planos das lojas ativas" },
    { label: "Novas lojas (7 dias)", value: String(newStores) },
    { label: "Pedidos (7 dias)", value: String(weekOrders._count), hint: `${formatBRL(weekOrders._sum.totalCents ?? 0)} vendidos pelas lojas` },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Visão geral</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-sm text-stone-500">{c.label}</p>
            <p className="text-2xl font-bold">{c.value}</p>
            {c.hint && <p className="mt-1 text-xs text-stone-500">{c.hint}</p>}
          </div>
        ))}
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Lojas por situação</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ORDER.map((s) => (
            <Link key={s} href={`/admin/lojas?situacao=${s}`} className="rounded-lg border border-stone-200 p-3 hover:bg-stone-50">
              <p className="text-2xl font-bold">{summary.bySituation[s]}</p>
              <p className="text-sm text-stone-600">{situationLabel[s]}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">Lojas demo</h2>
          <p className="text-sm text-stone-500">
            Para apresentar o sistema. Não têm cobrança nem pagamento online e não entram nos números acima.
            Senha do painel: a da variável DEMO_PASSWORD ({DEFAULT_DEMO_PASSWORD} se não estiver definida).
          </p>
        </div>
        {demos.length > 0 && (
          <ul className="divide-y divide-stone-100 text-sm">
            {demos.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <a href={`/loja/${s.slug}`} target="_blank" className="flex-1 font-medium text-brand-700 hover:underline">{s.name}</a>
                <span className="text-stone-500">{s.users[0]?.email}</span>
                <Link href={`/admin/lojas/${s.id}`} className="text-stone-600 hover:underline">detalhes</Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          <AdminActionForm action={resetDemoStores} hidden={{}} confirmText="Apagar e recriar as lojas demo? Pedidos e alterações feitos nelas serão perdidos.">
            <button className="btn">{demos.length ? "Recriar lojas demo" : "Criar lojas demo"}</button>
          </AdminActionForm>
          {demos.length > 0 && (
            <AdminActionForm action={deleteDemoStores} hidden={{}} confirmText="Apagar todas as lojas demo?">
              <button className="btn-ghost text-red-700">Apagar lojas demo</button>
            </AdminActionForm>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Cadastros mais recentes</h2>
        {recent.length === 0 && <p className="text-sm text-stone-500">Nenhuma loja cadastrada ainda.</p>}
        <ul className="divide-y divide-stone-100 text-sm">
          {recent.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <span className="w-12 text-stone-500">{dateFmt.format(s.createdAt)}</span>
              <Link href={`/admin/lojas/${s.id}`} className="flex-1 font-medium text-brand-700 hover:underline">{s.name}</Link>
              <span className="text-stone-500">{s.plan.name}</span>
              <SituationBadge situation={storeSituation(s)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
