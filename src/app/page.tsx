import Link from "next/link";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { TRIAL_DAYS } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export default async function Home() {
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { priceCents: "asc" } });
  return (
    <main>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="text-lg font-bold text-brand-700">WebTenda</span>
        <nav className="flex gap-2">
          <Link href="/entrar" className="btn-ghost">Entrar</Link>
          <Link href="/cadastro" className="btn">Criar minha loja</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Seu cardápio digital e seus pedidos, <span className="text-brand-600">sem comissão</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600">
          Para lanchonetes, pizzarias, padarias, mercadinhos e qualquer pequeno negócio local.
          Uma mensalidade fixa, pedidos ilimitados no seu link e aviso no WhatsApp.
        </p>
        <Link href="/cadastro" className="btn mt-8 px-6 py-3 text-base">
          Testar grátis por {TRIAL_DAYS} dias
        </Link>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-20 sm:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.id} className="card">
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p className="mt-2 text-3xl font-bold">
              {formatBRL(plan.priceCents)}
              <span className="text-sm font-normal text-stone-500">/mês</span>
            </p>
            <ul className="mt-4 space-y-1 text-sm text-stone-600">
              <li>{plan.maxProducts === 0 ? "Produtos ilimitados" : `Até ${plan.maxProducts} produtos`}</li>
              <li>{plan.maxOrdersMonth === 0 ? "Pedidos ilimitados" : `Até ${plan.maxOrdersMonth} pedidos/mês`}</li>
              <li>Link próprio do cardápio</li>
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
