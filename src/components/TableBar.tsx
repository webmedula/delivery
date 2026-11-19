"use client";

import { useState, useTransition } from "react";
import { formatBRL } from "@/lib/money";
import { callFromTable } from "@/app/loja/[slug]/actions";

export type TableInfo = {
  code: string;
  label: string;
  /** Conta aberta da mesa (null = nenhum pedido ainda). */
  bill: { orders: number; totalCents: number; dueCents: number; items: { name: string; quantity: number; totalCents: number }[] } | null;
};

/** Faixa da mesa no cardápio aberto pelo QR code: nome da mesa, conta até agora, chamar garçom e pedir a conta. */
export function TableBar({ slug, table }: { slug: string; table: TableInfo }) {
  const [called, setCalled] = useState<"WAITER" | "BILL" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const call = (kind: "WAITER" | "BILL") =>
    start(async () => {
      setError(null);
      const r = await callFromTable(slug, table.code, kind);
      if (r.ok) setCalled(kind);
      else setError(r.error ?? "Não foi possível chamar. Tente de novo.");
    });

  return (
    <section className="mx-3 mt-3 overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(28,25,23,0.06)] ring-1 ring-stone-900/[0.07] md:mx-6">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-11 min-w-11 flex-none items-center justify-center rounded-xl bg-emerald-600 px-2 text-white shadow-sm" aria-hidden>
          <IconTable />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight text-stone-900">Você está na {table.label}</p>
          <p className="text-sm text-stone-500">
            {table.bill ? (
              <>Conta da mesa: <strong className="text-stone-800">{formatBRL(table.bill.totalCents)}</strong> · {table.bill.orders} {table.bill.orders === 1 ? "pedido" : "pedidos"}</>
            ) : (
              "Escolha os itens e peça pelo celular. Paga no final."
            )}
          </p>
        </div>
      </div>
      {table.bill && table.bill.items.length > 0 && (
        <details className="group border-t border-stone-100 px-4 py-2 text-sm">
          <summary className="cursor-pointer list-none font-medium text-brand-700 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Ver o que já foi pedido ›</span>
            <span className="hidden group-open:inline">Esconder</span>
          </summary>
          <ul className="mt-2 space-y-1 text-stone-700">
            {table.bill.items.map((i) => (
              <li key={i.name + i.totalCents} className="flex justify-between gap-3">
                <span>{i.quantity}× {i.name}</span>
                <span className="tabular-nums">{formatBRL(i.totalCents)}</span>
              </li>
            ))}
            {table.bill.dueCents !== table.bill.totalCents && (
              <li className="flex justify-between gap-3 border-t border-stone-100 pt-1 font-medium">
                <span>Falta pagar (descontando o que foi pago pelo celular)</span>
                <span className="tabular-nums">{formatBRL(table.bill.dueCents)}</span>
              </li>
            )}
          </ul>
        </details>
      )}
      <div className="grid grid-cols-2 gap-2 border-t border-stone-100 bg-stone-50/70 p-2">
        <button type="button" disabled={pending} onClick={() => call("WAITER")} className="rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 ring-1 ring-stone-900/10 transition hover:bg-stone-100 disabled:opacity-60">
          {called === "WAITER" ? "Garçom chamado ✓" : "🙋 Chamar garçom"}
        </button>
        <button type="button" disabled={pending} onClick={() => call("BILL")} className="rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 ring-1 ring-stone-900/10 transition hover:bg-stone-100 disabled:opacity-60">
          {called === "BILL" ? "Conta pedida ✓" : "🧾 Pedir a conta"}
        </button>
      </div>
      {(called || error) && (
        <p className={`px-4 pb-3 text-center text-sm ${error ? "text-red-600" : "text-emerald-700"}`} role="status">
          {error ?? (called === "BILL" ? "Já avisamos a equipe. Logo trazem a conta." : "Já avisamos a equipe. Logo alguém vem até a mesa.")}
        </p>
      )}
    </section>
  );
}

function IconTable() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9h18M5 9l-1 11M19 9l1 11M8 9v5h8V9M7 5h10" />
    </svg>
  );
}
