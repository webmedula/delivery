import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { modulesFor } from "@/lib/niche";
import { formatPhone } from "@/lib/phone";
import { brDateOf, brDateTime } from "@/lib/preorder";
import { describeWorkHours, initials, professionalReport } from "@/lib/booking";
import { ProfessionalEditor, ProfessionalForm } from "@/components/ProfessionalForm";
import { GoogleAgendaPanel } from "@/components/GoogleAgendaPanel";
import { calendarEnabled } from "@/lib/google-calendar";
import { deleteProfessional, toggleProfessional } from "./actions";

export const dynamic = "force-dynamic";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function monthShift(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function ProfessionalsPage({ searchParams }: { searchParams: Promise<{ mes?: string; google?: string }> }) {
  const { store, storeId } = await requireStoreUser();
  if (!modulesFor(store).booking) redirect("/painel");
  const current = brDateOf(new Date()).slice(0, 7);
  const { mes: raw, google } = await searchParams;
  const month = raw && /^\d{4}-\d{2}$/.test(raw) && raw <= current ? raw : current;
  const from = brDateTime(`${month}-01`, "00:00");
  const to = brDateTime(`${monthShift(month, 1)}-01`, "00:00");

  const [pros, services, orders] = await Promise.all([
    db.professional.findMany({ where: { storeId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    db.product.findMany({ where: { storeId }, orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.order.findMany({
      where: { storeId, fulfillment: "APPOINTMENT", scheduledFor: { gte: from, lt: to } },
      select: { professionalId: true, status: true, totalCents: true, noShowAt: true },
    }),
  ]);
  const report = professionalReport(pros, orders);
  const totals = report.reduce((t, r) => ({ n: t.n + r.appointments, revenue: t.revenue + r.revenueCents, commission: t.commission + (r.commissionCents ?? 0), noShows: t.noShows + r.noShows }), { n: 0, revenue: 0, commission: 0, noShows: 0 });
  const [y, m] = month.split("-").map(Number);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <section className="card space-y-3">
          <div>
            <h1 className="text-xl font-semibold">Profissionais</h1>
            <p className="text-sm text-stone-500">Cada um tem os próprios dias e horários. O cliente escolhe com quem quer cortar, ou o primeiro horário livre.</p>
          </div>
          {pros.length === 0 && <p className="py-4 text-center text-sm text-stone-500">Cadastre o primeiro profissional ao lado para abrir a agenda.</p>}
          <ul className="divide-y divide-stone-100">
            {pros.map((p) => (
              <li key={p.id} className={`py-4 ${p.active ? "" : "opacity-60"}`}>
                <ProfessionalEditor
                  pro={{ id: p.id, name: p.name, phone: p.phone ? formatPhone(p.phone) : "", photoUrl: p.photoUrl, workHours: p.workHours, breakStart: p.breakStart, breakEnd: p.breakEnd, serviceIds: p.serviceIds, commissionPercent: p.commissionPercent }}
                  services={services}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full bg-brand-100 font-bold text-brand-700">
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : initials(p.name)}
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-stone-900">{p.name}{!p.active && <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium">pausado</span>}</p>
                      <p className="text-stone-600">{describeWorkHours(p.workHours) || "Sem dias de trabalho"}{p.breakStart ? ` · almoço ${p.breakStart}–${p.breakEnd}` : ""}</p>
                      <p className="text-stone-500">
                        {p.serviceIds.length === 0 ? "Todos os serviços" : services.filter((s) => p.serviceIds.includes(s.id)).map((s) => s.name).join(", ")}
                        {p.commissionPercent !== null && ` · comissão ${p.commissionPercent}%`}
                      </p>
                    </div>
                    <div className="flex flex-none gap-2 text-sm">
                      <form action={toggleProfessional}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-stone-600 hover:underline">{p.active ? "Pausar" : "Reativar"}</button>
                      </form>
                      <form action={deleteProfessional}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-red-600 hover:underline">Excluir</button>
                      </form>
                    </div>
                  </div>
                </ProfessionalEditor>
              </li>
            ))}
          </ul>
        </section>

        {calendarEnabled() && !store.isDemo && <GoogleAgendaPanel storeId={storeId} storeName={store.name} notice={google} />}

        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Fechamento de {MONTHS[m - 1]} de {y}</h2>
            <div className="flex gap-1 text-sm">
              <Link href={`/painel/profissionais?mes=${monthShift(month, -1)}`} className="btn-ghost">‹ Mês anterior</Link>
              {month < current && <Link href={`/painel/profissionais?mes=${monthShift(month, 1)}`} className="btn-ghost">Próximo ›</Link>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="py-2">Profissional</th><th className="py-2 text-right">Atendimentos</th><th className="py-2 text-right">Faturamento</th><th className="py-2 text-right">Comissão</th><th className="py-2 text-right">Faltas</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {report.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-right tabular-nums">{r.appointments}</td>
                    <td className="py-2 text-right tabular-nums">{formatBRL(r.revenueCents)}</td>
                    <td className="py-2 text-right tabular-nums">{r.commissionCents === null ? "–" : `${formatBRL(r.commissionCents)} (${r.commissionPercent}%)`}</td>
                    <td className="py-2 text-right tabular-nums">{r.noShows}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-stone-200 font-semibold">
                <tr><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{totals.n}</td><td className="py-2 text-right tabular-nums">{formatBRL(totals.revenue)}</td><td className="py-2 text-right tabular-nums">{formatBRL(totals.commission)}</td><td className="py-2 text-right tabular-nums">{totals.noShows}</td></tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-stone-500">Conta os atendimentos marcados como &quot;Atendido&quot; na agenda, pelo valor cobrado (com desconto de cupom ou fidelidade).</p>
        </section>
      </div>

      <section className="card space-y-3 self-start lg:col-span-2">
        <h2 className="font-semibold">Novo profissional</h2>
        <ProfessionalForm services={services} />
      </section>
    </div>
  );
}
