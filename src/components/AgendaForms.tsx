"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { addTimeBlock, createAppointment, markReminderSent, saveBookingSettings } from "@/app/painel/agenda/actions";
import { CANCEL_OPTIONS, MIN_NOTICE_OPTIONS, STEP_OPTIONS, formatDuration } from "@/lib/booking";
import { DEPOSIT_OPTIONS } from "@/lib/preorder";
import { formatBRL } from "@/lib/money";

type Option = { id: string; name: string };
type Service = Option & { priceCents: number; durationMinutes: number | null };

/** Abre o WhatsApp do cliente com o lembrete pronto e marca como enviado. */
export function ReminderButton({ id, url, sent, label = "Lembrete" }: { id: string; url: string; sent: boolean; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      onClick={() => start(() => markReminderSent(id))}
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${sent ? "bg-stone-100 text-stone-600" : "bg-[#1f9d55] text-white hover:bg-[#188a49]"}`}
    >
      {pending ? "..." : sent ? `✓ ${label} enviado` : `${label} no WhatsApp`}
    </a>
  );
}

/** Novo agendamento feito pelo painel (cliente ligou ou chegou no balcão). */
export function NewAppointmentForm({ services, pros, date }: { services: Service[]; pros: Option[]; date: string }) {
  const [state, action, pending] = useActionState(createAppointment, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="card space-y-3" id="novo">
      <div>
        <h2 className="font-semibold">Novo agendamento</h2>
        <p className="text-sm text-stone-500">Para quem marcou por telefone, mensagem ou no balcão.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="customerName" placeholder="Nome do cliente" className="input" required />
        <input name="customerPhone" placeholder="WhatsApp (opcional)" className="input" inputMode="tel" />
      </div>
      <fieldset>
        <legend className="label">Serviços</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="checkbox" name="serviceIds" value={s.id} className="accent-brand-600" />
              <span className="flex-1">{s.name}</span>
              <span className="text-xs text-stone-500">{formatDuration(s.durationMinutes || 30)} · {formatBRL(s.priceCents)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Profissional</label>
          <select name="professionalId" className="input" defaultValue="">
            <option value="">Quem estiver livre</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Dia</label>
          <input type="date" name="date" defaultValue={date} className="input" required />
        </div>
        <div>
          <label className="label">Horário</label>
          <input type="time" name="time" step={300} className="input" required />
        </div>
      </div>
      <input name="notes" placeholder="Observação (opcional)" className="input" />
      <label className="flex items-center gap-2 text-sm text-stone-600">
        <input type="checkbox" name="squeeze" /> Encaixe: marcar mesmo se o horário estiver ocupado ou fora do expediente
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Agendado ✓{" "}
          {state.whatsappUrl && <a href={state.whatsappUrl} target="_blank" rel="noopener" className="font-semibold underline">Mandar a confirmação no WhatsApp do cliente</a>}
        </p>
      )}
      <button className="btn" disabled={pending}>{pending ? "Agendando..." : "Agendar"}</button>
    </form>
  );
}

/** Bloquear horário (folga, compromisso, médico) de um profissional ou da barbearia toda. */
export function TimeBlockForm({ pros, date }: { pros: Option[]; date: string }) {
  const [state, action, pending] = useActionState(addTimeBlock, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="professionalId" className="input" defaultValue="">
          <option value="">Todos (barbearia fechada)</option>
          {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" name="date" defaultValue={date} className="input" required />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        das <input type="time" name="from" className="input w-28!" /> às <input type="time" name="to" className="input w-28!" />
        <label className="flex items-center gap-1.5"><input type="checkbox" name="wholeDay" /> dia inteiro</label>
      </div>
      <input name="reason" placeholder="Motivo (opcional), ex.: folga, médico" className="input" />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Horário bloqueado.</p>}
      <button className="btn-ghost" disabled={pending}>{pending ? "Salvando..." : "Bloquear horário"}</button>
    </form>
  );
}

type Settings = { step: number; minMinutes: number; maxDays: number; cancelHours: number; depositPercent: number; closedDates: string; onlinePix: boolean; pixKey: boolean };

/** Regras da agenda online. */
export function BookingSettingsForm({ values: v }: { values: Settings }) {
  const [state, action, pending] = useActionState(saveBookingSettings, undefined);
  return (
    <form action={action} className="card space-y-4" id="regras">
      <div>
        <h2 className="font-semibold">Regras da agenda online</h2>
        <p className="text-sm text-stone-500">O cliente só vê horários dentro destas regras. O expediente de cada um fica em Profissionais.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Horários de quanto em quanto tempo</label>
          <select name="bookingStepMinutes" defaultValue={v.step} className="input">
            {STEP_OPTIONS.map((m) => <option key={m} value={m}>A cada {m} minutos</option>)}
          </select>
        </div>
        <div>
          <label className="label">Antecedência mínima para marcar</label>
          <select name="bookingMinMinutes" defaultValue={v.minMinutes} className="input">
            {MIN_NOTICE_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Agenda aberta até quantos dias à frente</label>
          <input name="bookingMaxDays" defaultValue={v.maxDays} className="input" inputMode="numeric" />
        </div>
        <div>
          <label className="label">Cliente pode cancelar pelo link</label>
          <select name="bookingCancelHours" defaultValue={v.cancelHours} className="input">
            {CANCEL_OPTIONS.map((o) => <option key={o.hours} value={o.hours}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Sinal para garantir o horário</label>
        <select name="depositPercent" defaultValue={v.depositPercent} className="input">
          {DEPOSIT_OPTIONS.map((p) => (
            <option key={p} value={p}>{p === 0 ? "Sem sinal (paga no dia)" : p === 100 ? "Pagamento antecipado (100%)" : `${p}% do valor`}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">
          O sinal ajuda a acabar com os furos. {v.onlinePix ? "O cliente paga pelo Pix na hora e o horário só é garantido depois do pagamento." : v.pixKey ? "Como o Pix online não está ligado, o cliente manda o sinal pela sua chave Pix e você confere." : "Ligue o Pix online em Pagamentos ou cadastre sua chave Pix em Minha loja."}
        </p>
      </div>
      <div>
        <label className="label">Feriados e dias fechados</label>
        <input name="bookingClosedDates" defaultValue={v.closedDates} placeholder="Ex.: 25/12, 01/01" className="input" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Salvo.</p>}
      <button className="btn" disabled={pending}>{pending ? "Salvando..." : "Salvar regras"}</button>
    </form>
  );
}
