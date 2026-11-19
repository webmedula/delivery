import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { modulesFor } from "@/lib/niche";
import { onlineMethods } from "@/lib/payments";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { paymentLabel } from "@/lib/order-status";
import { brDateOf, brDateTime, brTimeOf, dayLabel, depositPaid, formatClosedDates } from "@/lib/preorder";
import { formatDuration, gridBounds, initials, parseWorkRange, reminderMessage, toMinutes } from "@/lib/booking";
import { storeUrl } from "@/lib/store-url";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BookingSettingsForm, NewAppointmentForm, ReminderButton, TimeBlockForm } from "@/components/AgendaForms";
import { removeTimeBlock, setAppointmentStatus } from "./actions";
import { toggleDepositPaid } from "../encomendas/actions";

export const dynamic = "force-dynamic";

const PX = 1.5; // pixels por minuto na grade
const DAY = 24 * 60 * 60_000;

function shiftDate(date: string, days: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { store, storeId } = await requireStoreUser();
  if (!modulesFor(store).booking) redirect("/painel");
  const now = new Date();
  const today = brDateOf(now);
  const raw = (await searchParams).dia;
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  const dayStart = brDateTime(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const tomorrowStart = brDateTime(shiftDate(today, 1), "00:00");
  const monthStart = brDateTime(`${today.slice(0, 7)}-01`, "00:00");

  const [allPros, orders, blocks, services, reminders, monthNoShows, upcomingCount] = await Promise.all([
    db.professional.findMany({ where: { storeId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    db.order.findMany({
      where: { storeId, fulfillment: "APPOINTMENT", scheduledFor: { gte: dayStart, lt: dayEnd }, NOT: { status: "CANCELED", noShowAt: null } },
      include: { items: { select: { name: true } } },
      orderBy: { scheduledFor: "asc" },
    }),
    db.timeBlock.findMany({ where: { storeId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } }, orderBy: { startsAt: "asc" } }),
    db.product.findMany({ where: { storeId, available: true }, orderBy: { position: "asc" }, select: { id: true, name: true, priceCents: true, durationMinutes: true } }),
    // Lembretes: atendimentos de hoje (ainda por vir) e de amanhã, com telefone e sem lembrete.
    db.order.findMany({
      where: {
        storeId, fulfillment: "APPOINTMENT", status: { in: ["PENDING", "CONFIRMED"] }, paymentStatus: { not: "AWAITING" },
        reminderSentAt: null, customerConfirmedAt: null, customerPhone: { not: "" },
        scheduledFor: { gte: new Date(now.getTime() + 30 * 60_000), lt: new Date(tomorrowStart.getTime() + DAY) },
      },
      include: { items: { select: { name: true } } },
      orderBy: { scheduledFor: "asc" },
      take: 30,
    }),
    db.order.count({ where: { storeId, fulfillment: "APPOINTMENT", noShowAt: { gte: monthStart } } }),
    db.order.count({ where: { storeId, fulfillment: "APPOINTMENT", status: { in: ["PENDING", "CONFIRMED"] }, scheduledFor: { gte: now } } }),
  ]);

  // Faltas anteriores de cada cliente do dia (para avisar quem costuma furar).
  const customerIds = [...new Set(orders.map((o) => o.customerId).filter((id): id is string => !!id))];
  const noShowBy = new Map(
    (await db.order.groupBy({ by: ["customerId"], where: { storeId, customerId: { in: customerIds }, noShowAt: { not: null } }, _count: true }))
      .map((r) => [r.customerId!, r._count]),
  );
  // Profissionais na grade: os ativos e quem tem atendimento no dia.
  const pros = allPros.filter((p) => p.active || orders.some((o) => o.professionalId === p.id));
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const bounds = gridBounds(pros, date, orders.map((o) => ({ start: o.scheduledFor!, end: o.endsAt })));
  const height = (bounds.end - bounds.start) * PX;
  const minuteOf = (d: Date) => (d < dayStart ? 0 : d >= dayEnd ? 24 * 60 : toMinutes(brTimeOf(d)));
  const top = (m: number) => (Math.max(bounds.start, Math.min(bounds.end, m)) - bounds.start) * PX;
  const nowMinute = date === today ? toMinutes(brTimeOf(now)) : null;
  const menuUrl = await storeUrl(store.slug);
  const active = orders.filter((o) => o.status !== "CANCELED" && o.paymentStatus !== "AWAITING");
  const expected = active.reduce((s, o) => s + o.totalCents, 0);
  const confirmed = active.filter((o) => o.customerConfirmedAt).length;
  const hours = Array.from({ length: (bounds.end - bounds.start) / 60 + 1 }, (_, i) => bounds.start + i * 60);
  const unassigned = orders.filter((o) => !o.professionalId || !pros.some((p) => p.id === o.professionalId));
  const reminderUrl = (o: (typeof reminders)[number]) =>
    whatsappLink(o.customerPhone, reminderMessage({ ...o, scheduledFor: o.scheduledFor! }, store.name, `${menuUrl}/agendamento/${o.id}`, now));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold first-letter:uppercase">{dayLabel(date, now)}</h1>
          <p className="text-sm text-stone-500">
            {active.length} {active.length === 1 ? "atendimento" : "atendimentos"} · {formatBRL(expected)} previsto
            {active.length > 0 && ` · ${confirmed} com presença confirmada`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/painel/agenda?dia=${shiftDate(date, -1)}`} className="btn-ghost" aria-label="Dia anterior">‹</Link>
          {date !== today && <Link href="/painel/agenda" className="btn-ghost">Hoje</Link>}
          <form className="flex">
            <input type="date" name="dia" defaultValue={date} className="input w-40!" />
            <button className="btn-ghost ml-1">Ir</button>
          </form>
          <Link href={`/painel/agenda?dia=${shiftDate(date, 1)}`} className="btn-ghost" aria-label="Próximo dia">›</Link>
          <a href="#novo" className="btn">+ Agendar</a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card py-3"><p className="text-xs text-stone-500">Próximos agendamentos</p><p className="text-2xl font-bold tabular-nums">{upcomingCount}</p></div>
        <div className="card py-3"><p className="text-xs text-stone-500">Faltas neste mês</p><p className="text-2xl font-bold tabular-nums">{monthNoShows}</p></div>
        <div className="card py-3">
          <p className="text-xs text-stone-500">Link para os clientes agendarem</p>
          <a href={menuUrl} target="_blank" className="block truncate text-sm font-semibold text-brand-700 underline">{menuUrl.replace(/^https?:\/\//, "")}</a>
        </div>
      </div>

      {reminders.length > 0 && (
        <section className="card space-y-2 border-[#1f9d55]/30 bg-green-50/50">
          <div>
            <h2 className="font-semibold">Lembretes para enviar ({reminders.length})</h2>
            <p className="text-sm text-stone-600">Quem tem horário hoje ou amanhã. O cliente recebe um link para confirmar presença ou cancelar, e o horário volta para a agenda.</p>
          </div>
          <ul className="divide-y divide-green-900/10 text-sm">
            {reminders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-24 font-semibold tabular-nums first-letter:uppercase">{brDateOf(o.scheduledFor!) === today ? "hoje" : "amanhã"} {brTimeOf(o.scheduledFor!)}</span>
                <span className="min-w-0 flex-1">{o.customerName} · <span className="text-stone-500">{o.items.map((i) => i.name).join(" + ")}{o.professionalName ? ` com ${o.professionalName.split(" ")[0]}` : ""}</span></span>
                <ReminderButton id={o.id} url={reminderUrl(o)} sent={false} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {pros.length === 0 ? (
        <div className="card text-center text-sm text-stone-600">
          Cadastre os profissionais e o horário de cada um em <Link href="/painel/profissionais" className="font-semibold text-brand-700 underline">Profissionais</Link> para abrir a agenda.
        </div>
      ) : (
        <section className="card overflow-x-auto p-0">
          <div className="flex min-w-fit w-full">
            <div className="sticky left-0 z-10 w-14 flex-none border-r border-stone-100 bg-white pt-12">
              <div className="relative" style={{ height }}>
                {hours.map((h) => (
                  <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-stone-400" style={{ top: top(h) }}>{String(h / 60).padStart(2, "0")}h</span>
                ))}
              </div>
            </div>
            {pros.map((p) => {
              const range = parseWorkRange(p.workHours[weekday]);
              const mine = orders.filter((o) => o.professionalId === p.id);
              const myBlocks = blocks.filter((b) => !b.professionalId || b.professionalId === p.id);
              const off: [number, number][] = range
                ? [[bounds.start, range.start], [range.end, bounds.end], ...(p.breakStart && p.breakEnd ? [[toMinutes(p.breakStart), toMinutes(p.breakEnd)] as [number, number]] : [])]
                : [[bounds.start, bounds.end]];
              return (
                <div key={p.id} className="min-w-44 flex-1 border-r border-stone-100 last:border-r-0 sm:min-w-52">
                  <div className="flex h-12 items-center gap-2 border-b border-stone-100 px-3">
                    <span className="flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : initials(p.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block text-[11px] text-stone-500">{range ? `${p.workHours[weekday].replace("-", " às ")}` : "Folga"}</span>
                    </span>
                  </div>
                  <div className="relative" style={{ height }}>
                    {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-stone-100" style={{ top: top(h) }} />)}
                    {off.filter(([a, b]) => b > a).map(([a, b], i) => (
                      <div key={i} className="absolute inset-x-0 bg-stone-100/80 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_0_0/0.035)_6px_12px)]" style={{ top: top(a), height: top(b) - top(a) }} />
                    ))}
                    {myBlocks.map((b) => (
                      <div key={b.id} className="absolute inset-x-1 flex items-start rounded-md bg-stone-300/70 px-2 py-1 text-[11px] font-medium text-stone-700" style={{ top: top(minuteOf(b.startsAt)), height: Math.max(18, top(minuteOf(b.endsAt)) - top(minuteOf(b.startsAt))) }}>
                        🔒 {b.reason || "Bloqueado"}
                      </div>
                    ))}
                    {mine.map((o) => {
                      const s = minuteOf(o.scheduledFor!);
                      const e = o.endsAt ? minuteOf(o.endsAt) : s + 30;
                      const h = Math.max(22, top(e) - top(s) - 2);
                      const tone = o.status === "CANCELED" ? "bg-red-50 text-red-800 ring-red-200 line-through opacity-70"
                        : o.status === "COMPLETED" ? "bg-stone-100 text-stone-600 ring-stone-200"
                        : o.paymentStatus === "AWAITING" ? "bg-amber-50 text-amber-900 ring-amber-300 border-dashed"
                        : o.customerConfirmedAt ? "bg-emerald-50 text-emerald-900 ring-emerald-300"
                        : "bg-brand-50 text-brand-700 ring-brand-100";
                      return (
                        <a key={o.id} href={`#a-${o.id}`} className={`absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-[12px] leading-tight ring-1 hover:z-10 hover:shadow-md ${tone}`} style={{ top: top(s) + 1, height: h }}>
                          <span className="font-bold tabular-nums">{brTimeOf(o.scheduledFor!)}</span> {o.customerName.split(" ")[0]}
                          {o.customerConfirmedAt && o.status !== "COMPLETED" && " ✓"}
                          {h > 34 && <span className="block truncate opacity-80">{o.items.map((i) => i.name).join(" + ")}</span>}
                        </a>
                      );
                    })}
                    {nowMinute !== null && nowMinute >= bounds.start && nowMinute <= bounds.end && (
                      <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500" style={{ top: top(nowMinute) }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card space-y-1">
        <h2 className="font-semibold">Atendimentos do dia</h2>
        {orders.length === 0 && <p className="py-4 text-center text-sm text-stone-500">Nenhum horário marcado neste dia.</p>}
        {unassigned.length > 0 && <p className="text-xs text-amber-700">{unassigned.length} atendimento(s) sem profissional ativo na grade aparecem só na lista.</p>}
        <ul className="divide-y divide-stone-100">
          {orders.map((o) => {
            const faltas = o.customerId ? (noShowBy.get(o.customerId) ?? 0) - (o.noShowAt ? 1 : 0) : 0;
            const minutes = o.endsAt ? Math.round((o.endsAt.getTime() - o.scheduledFor!.getTime()) / 60_000) : 30;
            const open = o.status !== "CANCELED" && o.status !== "COMPLETED";
            const url = `${menuUrl}/agendamento/${o.id}`;
            return (
              <li key={o.id} id={`a-${o.id}`} className="scroll-mt-24 py-3 target:bg-brand-50/60">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="w-16 flex-none">
                    <span className="block text-lg font-bold tabular-nums">{brTimeOf(o.scheduledFor!)}</span>
                    <span className="text-xs text-stone-500">{formatDuration(minutes)}</span>
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold">
                      {o.customerId ? <Link href={`/painel/clientes/${o.customerId}`} className="hover:underline">{o.customerName}</Link> : o.customerName}
                      {o.customerPhone && <a href={whatsappLink(o.customerPhone)} target="_blank" className="ml-2 font-normal text-stone-500 hover:underline">{formatPhone(o.customerPhone)}</a>}
                      {faltas > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">faltou {faltas}x</span>}
                    </span>
                    <span className="block text-stone-600">{o.items.map((i) => i.name).join(" + ")}{o.professionalName ? ` · ${o.professionalName}` : ""}</span>
                    <span className="block text-stone-500">
                      {formatBRL(o.totalCents)} · {paymentLabel[o.paymentMethod]}
                      {o.paymentStatus === "PAID" && !o.depositCents && " · pago"}
                      {o.depositCents ? (depositPaid(o) ? ` · sinal de ${formatBRL(o.depositCents)} pago` : ` · sinal de ${formatBRL(o.depositCents)} pendente`) : ""}
                    </span>
                    {o.notes && <span className="block text-stone-700">“{o.notes}”</span>}
                  </span>
                  <span className="flex-none text-right text-xs font-semibold">
                    {o.status === "CANCELED" ? (
                      <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">{o.noShowAt ? "Não veio" : "Cancelado"}</span>
                    ) : o.status === "COMPLETED" ? (
                      <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">Atendido</span>
                    ) : o.paymentStatus === "AWAITING" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Aguardando pagamento</span>
                    ) : o.customerConfirmedAt ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">Presença confirmada</span>
                    ) : (
                      <span className="rounded-full bg-brand-100 px-2 py-1 text-brand-700">Agendado</span>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 pl-[4.75rem]">
                  {open && o.paymentStatus !== "AWAITING" && (
                    <>
                      <StatusButton id={o.id} action="complete" label="✓ Atendido" primary />
                      <StatusButton id={o.id} action="noshow" label="Não veio" />
                      {!o.customerConfirmedAt && <StatusButton id={o.id} action="confirm" label="Confirmou" />}
                      {o.customerPhone && (
                        <ReminderButton id={o.id} sent={!!o.reminderSentAt} url={whatsappLink(o.customerPhone, reminderMessage({ ...o, scheduledFor: o.scheduledFor! }, store.name, url, now))} />
                      )}
                      {o.depositCents && o.paymentStatus !== "PAID" && (
                        <form action={toggleDepositPaid}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <button className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200">{o.depositPaidAt ? "Desfazer sinal" : "Sinal recebido"}</button>
                        </form>
                      )}
                      <StatusButton id={o.id} action="cancel" label="Cancelar" danger />
                    </>
                  )}
                  {!open && <StatusButton id={o.id} action="reopen" label="Desfazer" />}
                  <a href={url} target="_blank" className="rounded-lg px-2.5 py-1.5 text-xs text-stone-500 hover:underline">Página do cliente</a>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <NewAppointmentForm services={services} pros={allPros.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))} date={date} />
        <section className="card space-y-3">
          <div>
            <h2 className="font-semibold">Bloquear horário</h2>
            <p className="text-sm text-stone-500">Folga, médico, compromisso. O horário some da agenda online.</p>
          </div>
          <TimeBlockForm pros={allPros.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))} date={date} />
          {blocks.length > 0 && (
            <ul className="divide-y divide-stone-100 border-t border-stone-100 pt-2 text-sm">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {b.endsAt.getTime() - b.startsAt.getTime() >= 23 * 60 * 60_000 ? "Dia inteiro" : `${brTimeOf(b.startsAt)} às ${brTimeOf(b.endsAt)}`} ·{" "}
                    {allPros.find((p) => p.id === b.professionalId)?.name ?? "Todos"}{b.reason ? ` · ${b.reason}` : ""}
                  </span>
                  <form action={removeTimeBlock}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="text-red-600 hover:underline">Remover</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <BookingSettingsForm
        values={{
          step: store.bookingStepMinutes,
          minMinutes: store.bookingMinMinutes,
          maxDays: store.bookingMaxDays,
          cancelHours: store.bookingCancelHours,
          depositPercent: store.depositPercent,
          closedDates: formatClosedDates(store.bookingClosedDates),
          onlinePix: onlineMethods(store).pix,
          pixKey: !!store.pixKey,
        }}
      />
    </div>
  );
}

function StatusButton({ id, action, label, primary, danger }: { id: string; action: string; label: string; primary?: boolean; danger?: boolean }) {
  return (
    <form action={setAppointmentStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button
        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
          primary ? "bg-brand-600 text-white hover:bg-brand-700" : danger ? "text-red-700 hover:bg-red-50" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
