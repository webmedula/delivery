import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { summarizePartner } from "@/lib/partner";
import { AdminActionForm } from "@/components/AdminForms";
import { PartnerFields } from "@/components/PartnerFields";
import { createPartner } from "../actions";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  await requireAdmin();
  const partners = await db.partner.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { stores: { include: { plan: true } } },
  });
  const rows = partners.map((p) => ({ partner: p, summary: summarizePartner(p.stores, p.commissionPercent) }));
  const totalCommission = rows.reduce((sum, r) => sum + r.summary.commissionCents, 0);
  const totalPaying = rows.reduce((sum, r) => sum + r.summary.paying, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Parceiros</h1>
        <p className="text-sm text-stone-500">
          Quem revende a WebTenda. Cada parceiro tem um código; a loja que se cadastra pelo link dele (ou digita o código) fica ligada a ele.
          A comissão é uma porcentagem da mensalidade das lojas indicadas que estão pagando, e você paga por fora (Pix).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-stone-500">Parceiros ativos</p><p className="text-2xl font-bold">{partners.filter((p) => p.active).length}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Lojas indicadas pagando</p><p className="text-2xl font-bold">{totalPaying}</p></div>
        <div className="card">
          <p className="text-sm text-stone-500">Comissão do mês (hoje)</p>
          <p className="text-2xl font-bold">{formatBRL(totalCommission)}</p>
          <p className="mt-1 text-xs text-stone-500">soma das lojas com assinatura em dia agora</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">Parceiro</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3 text-right">Lojas</th>
              <th className="px-4 py-3 text-right">Em teste</th>
              <th className="px-4 py-3 text-right">Pagando</th>
              <th className="px-4 py-3 text-right">Mensalidades</th>
              <th className="px-4 py-3 text-right">Comissão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map(({ partner: p, summary: s }) => (
              <tr key={p.id} className={p.active ? "hover:bg-stone-50" : "text-stone-400 hover:bg-stone-50"}>
                <td className="px-4 py-3">
                  <Link href={`/admin/parceiros/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.name}</Link>
                  {!p.active && <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">Desativado</span>}
                </td>
                <td className="px-4 py-3 font-mono">{p.code}</td>
                <td className="px-4 py-3 text-right">{s.total}</td>
                <td className="px-4 py-3 text-right">{s.trial}</td>
                <td className="px-4 py-3 text-right font-semibold">{s.paying}</td>
                <td className="px-4 py-3 text-right">{formatBRL(s.monthlyCents)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatBRL(s.commissionCents)}<p className="text-xs font-normal text-stone-500">{p.commissionPercent}%</p></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-500">Nenhum parceiro cadastrado ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">Novo parceiro</h2>
        <AdminActionForm action={createPartner} hidden={{}}>
          <PartnerFields />
          <button className="btn">Cadastrar parceiro</button>
        </AdminActionForm>
      </section>
    </div>
  );
}
