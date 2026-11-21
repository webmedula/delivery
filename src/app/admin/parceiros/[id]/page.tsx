import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { commissionCents, PARTNER_PARAM, storePaysCommission, summarizePartner } from "@/lib/partner";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { siteUrl } from "@/lib/store-url";
import { storeSituation } from "@/lib/subscription";
import { SituationBadge } from "@/components/SituationBadge";
import { AdminActionForm } from "@/components/AdminForms";
import { CopyLink } from "@/components/CopyLink";
import { PartnerFields } from "@/components/PartnerFields";
import { togglePartner, updatePartner } from "../../actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
/** Página de vendas (outro repositório: webmedula/webtenda-site). Ela repassa ?parceiro= para os botões de cadastro. */
const SALES_SITE = "https://webtenda.com.br";

export default async function PartnerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const partner = await db.partner.findUnique({
    where: { id },
    include: { stores: { include: { plan: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!partner) notFound();
  const summary = summarizePartner(partner.stores, partner.commissionPercent);
  const hidden = { partnerId: partner.id };
  const q = `?${PARTNER_PARAM}=${partner.code}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/parceiros" className="text-sm text-stone-500 hover:underline">← Parceiros</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{partner.name}</h1>
          <span className="rounded-lg bg-stone-100 px-2 py-0.5 font-mono text-sm">{partner.code}</span>
          {!partner.active && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">Desativado</span>}
          {partner.whatsapp && (
            <a href={whatsappLink(partner.whatsapp)} target="_blank" className="text-sm text-brand-700 hover:underline">WhatsApp {formatPhone(partner.whatsapp)}</a>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card"><p className="text-sm text-stone-500">Lojas indicadas</p><p className="text-2xl font-bold">{summary.total}</p><p className="mt-1 text-xs text-stone-500">{summary.trial} em teste agora</p></div>
        <div className="card"><p className="text-sm text-stone-500">Pagando</p><p className="text-2xl font-bold">{summary.paying}</p></div>
        <div className="card"><p className="text-sm text-stone-500">Mensalidades das pagantes</p><p className="text-2xl font-bold">{formatBRL(summary.monthlyCents)}</p></div>
        <div className="card">
          <p className="text-sm text-stone-500">Comissão do mês ({partner.commissionPercent}%)</p>
          <p className="text-2xl font-bold">{formatBRL(summary.commissionCents)}</p>
          <p className="mt-1 text-xs text-stone-500">{partner.pixKey ? `Pix: ${partner.pixKey}` : "sem chave Pix cadastrada"}</p>
        </div>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">Links do parceiro</h2>
        <p className="text-sm text-stone-500">Mande um destes para o parceiro. Quem se cadastra por eles já fica ligado a {partner.name}. O lojista também pode digitar o código <strong>{partner.code}</strong> no cadastro.</p>
        <CopyLink label="Página de vendas (para apresentar a WebTenda)" url={`${SALES_SITE}/${q}`} />
        <CopyLink label="Direto no cadastro (quando o parceiro monta a loja)" url={`${await siteUrl()}/cadastro${q}`} />
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 font-semibold">Lojas que {partner.name} trouxe</h2>
        <table className="mt-2 w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">Loja</th>
              <th className="px-4 py-3">Cadastro</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3 text-right">Comissão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {partner.stores.map((s) => (
              <tr key={s.id} className="hover:bg-stone-50">
                <td className="px-4 py-3"><Link href={`/admin/lojas/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.name}</Link></td>
                <td className="px-4 py-3 text-stone-600">{dateFmt.format(s.createdAt)}</td>
                <td className="px-4 py-3"><SituationBadge situation={storeSituation(s)} /></td>
                <td className="px-4 py-3">{s.plan.name} <span className="text-stone-500">{formatBRL(s.plan.priceCents)}</span></td>
                <td className="px-4 py-3 text-right font-semibold">
                  {storePaysCommission(s) ? formatBRL(commissionCents(s.plan.priceCents, partner.commissionPercent)) : <span className="font-normal text-stone-400">—</span>}
                </td>
              </tr>
            ))}
            {partner.stores.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-500">Nenhuma loja ainda.</td></tr>}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-stone-500">Comissão só nas lojas com a assinatura em dia hoje. Loja em teste, com pagamento atrasado, cancelada ou bloqueada não conta.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Dados do parceiro</h2>
        <AdminActionForm action={updatePartner} hidden={hidden}>
          <PartnerFields partner={partner} />
          <button className="btn">Salvar</button>
        </AdminActionForm>
        <p className="text-xs text-stone-500">Trocar o código faz o link antigo parar de funcionar. As lojas que ele já trouxe continuam ligadas.</p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{partner.active ? "Desativar parceiro" : "Reativar parceiro"}</h2>
        <p className="text-sm text-stone-500">
          {partner.active
            ? "O código e os links param de valer para cadastros novos. As lojas que ele já trouxe continuam aparecendo aqui."
            : "O código e os links voltam a valer para cadastros novos."}
        </p>
        <AdminActionForm action={togglePartner} hidden={hidden} confirmText={partner.active ? `Desativar ${partner.name}?` : undefined}>
          <button className={partner.active ? "btn-ghost text-red-700" : "btn"}>{partner.active ? "Desativar" : "Reativar"}</button>
        </AdminActionForm>
      </section>
    </div>
  );
}
