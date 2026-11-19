"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { previewCoupon } from "@/app/loja/[slug]/actions";
import { getAvailability, placeBooking } from "@/app/loja/[slug]/booking-actions";
import { DEFAULT_DURATION, formatDuration, initials, type BookingDay } from "@/lib/booking";
import { depositFor } from "@/lib/preorder";
import { InstallInvite } from "@/components/InstallApp";

export type BookingService = { id: string; name: string; description: string | null; priceCents: number; durationMinutes: number | null; imageUrl: string | null };
export type BookingPro = { id: string; name: string; photoUrl: string | null; serviceIds: string[]; hours: string };
type Section = { id: string; name: string; services: BookingService[] };
type StoreInfo = {
  slug: string; name: string; description: string | null; address: string | null; logoUrl: string | null; whatsapp: string | null;
  accepting: boolean; demo: boolean; pixKey: boolean;
  loyalty: string | null;
  reward: { type: "PERCENT" | "FIXED"; value: number } | null;
  online: { pix: boolean; card: boolean };
  depositPercent: number;
  minNotice: string | null;
  cancelText: string | null;
  hours: string | null;
};
export type BookingCustomer = {
  name: string; phone: string; marketingOptIn: boolean; cpfCnpj: string | null;
  loyalty: { stamps: number; ordersRequired: number; rewardAvailable: boolean } | null;
  upcoming: { id: string; when: string; services: string; professional: string | null }[];
};
type Payment = "IN_PERSON" | "PIX" | "ONLINE_PIX" | "ONLINE_CARD";

const ANY = "";

/** Página pública da barbearia/salão: escolher serviços, profissional, dia e horário, e confirmar. */
export function BookingFlow({ store, sections, pros, customer }: { store: StoreInfo; sections: Section[]; pros: BookingPro[]; customer: BookingCustomer | null }) {
  const router = useRouter();
  const services = useMemo(() => sections.flatMap((s) => s.services), [sections]);
  const [selected, setSelected] = useState<string[]>([]);
  const [proId, setProId] = useState<string>(ANY);
  const [days, setDays] = useState<BookingDay[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, startLoading] = useTransition();
  const [checkout, setCheckout] = useState(false);
  const [pending, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [useReward, setUseReward] = useState(!!customer?.loyalty?.rewardAvailable);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const requestId = useRef(0);
  const proRef = useRef<HTMLElement>(null);
  const dayRef = useRef<HTMLElement>(null);

  const chosen = selected.map((id) => services.find((s) => s.id === id)!).filter(Boolean);
  const duration = chosen.reduce((s, x) => s + (x.durationMinutes || DEFAULT_DURATION), 0);
  const subtotal = chosen.reduce((s, x) => s + x.priceCents, 0);
  const eligible = pros.filter((p) => p.serviceIds.length === 0 || selected.every((id) => p.serviceIds.includes(id)));
  const pro = pros.find((p) => p.id === proId) ?? null;
  const day = days?.find((d) => d.date === date) ?? null;
  const slot = day?.slots.find((s) => s.time === time) ?? null;

  // O profissional escolhido não faz um dos serviços: volta para "qualquer um".
  useEffect(() => {
    if (proId && !eligible.some((p) => p.id === proId)) setProId(ANY);
  }, [eligible, proId]);

  // Horários livres: busca de novo quando muda o serviço ou o profissional.
  useEffect(() => {
    setTime("");
    if (selected.length === 0) {
      setDays(null);
      return;
    }
    const id = ++requestId.current;
    startLoading(async () => {
      const r = await getAvailability(store.slug, selected, proId || null);
      if (id !== requestId.current) return;
      if (!r.ok) {
        setLoadError(r.error);
        setDays([]);
        return;
      }
      setLoadError(null);
      setDays(r.days);
      setDate((current) => (r.days.some((d) => d.date === current && d.slots.length) ? current : (r.days.find((d) => d.slots.length)?.date ?? "")));
    });
  }, [selected, proId, store.slug]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setCoupon(null);
  }

  const rewardActive = useReward && !!customer?.loyalty?.rewardAvailable && !!store.reward;
  const discount = rewardActive
    ? Math.min(subtotal, store.reward!.type === "PERCENT" ? Math.round((subtotal * store.reward!.value) / 100) : store.reward!.value)
    : (coupon?.discountCents ?? 0);
  const total = subtotal - discount;
  const deposit = depositFor(total, store.depositPercent);
  const needsAdvance = store.depositPercent > 0;

  const paymentOptions: { value: Payment; label: string }[] = [
    ...(!needsAdvance ? [{ value: "IN_PERSON" as const, label: "Pagar na hora, no local" }] : []),
    ...(store.online.pix ? [{ value: "ONLINE_PIX" as const, label: needsAdvance && deposit ? `Pix agora (sinal de ${formatBRL(deposit)})` : "Pix agora pelo celular" }] : []),
    ...(store.online.card ? [{ value: "ONLINE_CARD" as const, label: needsAdvance && deposit ? `Cartão de crédito agora (sinal de ${formatBRL(deposit)})` : "Cartão de crédito agora" }] : []),
    ...(needsAdvance && store.pixKey ? [{ value: "PIX" as const, label: "Pix pela chave da barbearia (envio o comprovante)" }] : []),
  ];
  const [payment, setPayment] = useState<Payment>(paymentOptions[0]?.value ?? "IN_PERSON");
  const payOnline = payment === "ONLINE_PIX" || payment === "ONLINE_CARD";

  async function applyCoupon() {
    setCheckingCoupon(true);
    setCouponError(null);
    const r = await previewCoupon(store.slug, couponInput, subtotal, phone);
    setCheckingCoupon(false);
    if (r.ok) setCoupon({ code: r.code, discountCents: r.discountCents });
    else {
      setCoupon(null);
      setCouponError(r.error);
    }
  }

  function submit(form: FormData) {
    setError(null);
    startSubmit(async () => {
      const r = await placeBooking({
        slug: store.slug,
        serviceIds: selected,
        professionalId: proId || null,
        date,
        time,
        customerName: String(form.get("customerName") ?? ""),
        customerPhone: phone,
        notes: String(form.get("notes") ?? ""),
        paymentMethod: payment,
        cpfCnpj: payOnline ? String(form.get("cpfCnpj") ?? "") : undefined,
        couponCode: rewardActive ? undefined : coupon?.code,
        useReward: rewardActive,
        marketingOptIn: form.get("marketingOptIn") === "on",
      });
      if (!r.ok) {
        setError(r.error);
        if (r.refresh) {
          // Alguém pegou o horário: atualiza a agenda e volta para escolher.
          const again = await getAvailability(store.slug, selected, proId || null);
          if (again.ok) setDays(again.days);
          setTime("");
          setCheckout(false);
        }
        return;
      }
      router.push(`/loja/${store.slug}/agendamento/${r.id}`);
    });
  }

  const cover = services.find((s) => s.imageUrl)?.imageUrl ?? null;
  const periods = day ? groupByPeriod(day.slots.map((s) => s.time)) : [];
  const ready = selected.length > 0 && !!slot;

  return (
    <div className="min-h-screen bg-stone-100/70 pb-36">
      {store.demo && (
        <div className="bg-stone-900 px-4 py-2 text-center text-[13px] leading-snug text-stone-200">
          Barbearia de demonstração da WebTenda: pode agendar à vontade, ninguém vai te esperar.{" "}
          <a href="https://webtenda.com.br/barbearia/" className="whitespace-nowrap font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">Quero uma agenda assim →</a>
        </div>
      )}

      <div className="mx-auto max-w-3xl md:px-6 md:pt-6">
        <div className="relative h-44 overflow-hidden bg-brand-700 sm:h-52 md:rounded-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,var(--color-brand-500),var(--color-brand-700)_75%)]" />
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wide(cover)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 h-full w-full object-cover opacity-90" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
          <Link
            href={`/loja/${store.slug}/conta`}
            className="absolute right-3 top-3 rounded-full bg-white/95 px-3.5 py-1.5 text-sm font-semibold text-stone-800 shadow-md shadow-black/15 hover:bg-white"
          >
            {customer ? `Olá, ${customer.name.split(" ")[0]}` : "Meus horários"}
          </Link>
        </div>

        <header className="relative mx-3 -mt-10 rounded-2xl bg-white px-4 pb-4 pt-3 shadow-[0_8px_30px_-12px_rgba(28,25,23,0.25)] ring-1 ring-stone-900/5 md:mx-0 md:px-6">
          <div className="flex items-end gap-3">
            {store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logoUrl} alt="" className="-mt-10 h-20 w-20 flex-none rounded-xl bg-white object-cover shadow-lg ring-4 ring-white" />
            ) : (
              <div className="-mt-10 flex h-20 w-20 flex-none items-center justify-center rounded-xl bg-brand-600 text-3xl font-bold text-white shadow-lg ring-4 ring-white">{store.name.charAt(0)}</div>
            )}
            <h1 className="pb-0.5 text-[1.6rem] font-bold leading-tight tracking-tight text-stone-900 [text-wrap:balance]">{store.name}</h1>
          </div>
          {store.description && <p className="mt-2 text-[15px] leading-relaxed text-stone-600 [text-wrap:pretty]">{store.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-[13px] [&>span]:whitespace-nowrap">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${store.accepting ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15" : "bg-stone-100 text-stone-600"}`}>
              <span className={`h-2 w-2 rounded-full ${store.accepting ? "bg-emerald-500" : "bg-stone-400"}`} />
              {store.accepting ? "Agenda aberta" : "Agendamentos pausados"}
            </span>
            {store.hours && <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">🕘 {store.hours}</span>}
            {store.address && <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">📍 {store.address}</span>}
            {needsAdvance && <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">{store.depositPercent >= 100 ? "Pagamento antecipado" : `Sinal de ${store.depositPercent}% para garantir`}</span>}
          </div>
        </header>

        {customer && customer.upcoming.length > 0 && (
          <section className="mx-3 mt-3 rounded-2xl bg-white p-4 ring-1 ring-stone-900/5 md:mx-0">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Seus próximos horários</h2>
            <ul className="mt-2 divide-y divide-stone-100">
              {customer.upcoming.map((u) => (
                <li key={u.id}>
                  <Link href={`/loja/${store.slug}/agendamento/${u.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-brand-700">
                    <span>
                      <strong className="block first-letter:uppercase">{u.when}</strong>
                      <span className="text-stone-500">{u.services}{u.professional ? ` com ${u.professional.split(" ")[0]}` : ""}</span>
                    </span>
                    <span aria-hidden className="text-xl text-stone-400">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {store.loyalty && (
          <Link href={`/loja/${store.slug}/conta`} className="mx-3 mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3.5 text-white shadow-md shadow-brand-700/20 md:mx-0">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/20 text-lg ring-1 ring-white/30" aria-hidden>★</span>
            <span className="min-w-0 flex-1 text-sm leading-snug">
              <strong className="block text-[15px]">Cartão fidelidade</strong>
              <span className="text-white/90">{store.loyalty.charAt(0).toUpperCase() + store.loyalty.slice(1)}.</span>
              {customer?.loyalty && (
                <span className="mt-1 block text-xs font-semibold">
                  {customer.loyalty.rewardAvailable ? "Você já ganhou a sua recompensa! Use neste agendamento." : `Seus selos: ${customer.loyalty.stamps} de ${customer.loyalty.ordersRequired}`}
                </span>
              )}
            </span>
          </Link>
        )}

        <InstallInvite slug={store.slug} name={store.name} logoUrl={store.logoUrl} />

        {/* 1. Serviços */}
        <section className="px-3 pt-6 md:px-0">
          <Step n={1} title="Escolha o serviço" hint="Pode marcar mais de um" />
          {services.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-stone-500">Os serviços ainda estão sendo cadastrados.</p>}
          {sections.map((s) => (
            <div key={s.id} className="mt-3">
              {sections.length > 1 && <h3 className="mb-2 px-1 text-sm font-semibold text-stone-500">{s.name}</h3>}
              <ul className="grid gap-2 sm:grid-cols-2">
                {s.services.map((sv) => {
                  const on = selected.includes(sv.id);
                  return (
                    <li key={sv.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(sv.id)}
                        disabled={!store.accepting}
                        className={`flex h-full w-full items-start gap-3 rounded-2xl bg-white p-3.5 text-left ring-1 transition ${on ? "ring-2 ring-brand-600 shadow-md shadow-brand-700/10" : "ring-stone-900/5 hover:ring-brand-500"}`}
                      >
                        <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md text-xs font-bold ${on ? "bg-brand-600 text-white" : "ring-1 ring-stone-300"}`}>{on ? "✓" : ""}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-stone-900">{sv.name}</span>
                          {sv.description && <span className="mt-0.5 block text-[13px] leading-snug text-stone-500">{sv.description}</span>}
                          <span className="mt-1.5 flex items-center gap-2 text-sm">
                            <span className="font-bold text-stone-900">{formatBRL(sv.priceCents)}</span>
                            <span className="text-stone-400">·</span>
                            <span className="text-stone-600">{formatDuration(sv.durationMinutes || DEFAULT_DURATION)}</span>
                          </span>
                        </span>
                        {sv.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sv.imageUrl} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-16 w-16 flex-none rounded-xl bg-stone-100 object-cover" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        {/* 2. Profissional */}
        {selected.length > 0 && pros.length > 0 && (
          <section ref={proRef} className="px-3 pt-7 md:px-0">
            <Step n={2} title="Com quem?" />
            <div className="mt-3 -mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
              {eligible.length > 1 && (
                <ProCard active={proId === ANY} onClick={() => setProId(ANY)} name="Qualquer um" sub="Primeiro horário livre" avatar={<span className="text-xl">✦</span>} />
              )}
              {eligible.map((p) => (
                <ProCard
                  key={p.id}
                  active={proId === p.id || (eligible.length === 1 && proId === ANY)}
                  onClick={() => setProId(p.id)}
                  name={p.name.split(" ")[0]}
                  sub={p.hours}
                  avatar={p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : <span className="text-lg font-bold">{initials(p.name)}</span>}
                />
              ))}
            </div>
            {eligible.length === 0 && <p className="mt-2 text-sm text-stone-600">Nenhum profissional faz todos esses serviços juntos. Tente marcar um de cada vez.</p>}
          </section>
        )}

        {/* 3. Dia e horário */}
        {selected.length > 0 && eligible.length > 0 && (
          <section ref={dayRef} className="px-3 pt-7 md:px-0">
            <Step n={3} title="Dia e horário" hint={`${formatDuration(duration)} de atendimento`} />
            {loadError && <p className="mt-2 text-sm text-red-600">{loadError}</p>}
            {days === null || (loading && days.length === 0) ? (
              <p className="mt-3 text-sm text-stone-500">Procurando horários livres…</p>
            ) : days.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-stone-600">Sem horários livres nos próximos dias. {store.whatsapp && "Chame a barbearia no WhatsApp."}</p>
            ) : (
              <div className={`mt-3 space-y-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
                <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
                  {days.map((d) => {
                    const [wd, dm] = d.label.split(", ");
                    const active = d.date === date;
                    const full = d.slots.length === 0;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        disabled={full}
                        aria-pressed={active}
                        onClick={() => { setDate(d.date); setTime(""); }}
                        className={`flex w-[3.6rem] flex-none flex-col items-center rounded-xl py-2 text-center transition ${
                          active ? "bg-brand-600 text-white shadow-md shadow-brand-700/20" : full ? "bg-stone-100 text-stone-400" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:ring-brand-500"
                        }`}
                      >
                        <span className={`text-[11px] font-semibold uppercase ${active ? "text-white/85" : ""}`}>{wd}</span>
                        <span className="text-[15px] font-bold tabular-nums">{dm}</span>
                        <span className={`text-[10px] ${active ? "text-white/80" : "text-stone-400"}`}>{full ? "lotado" : `${d.slots.length} hor.`}</span>
                      </button>
                    );
                  })}
                </div>
                {day && periods.map((p) => (
                  <div key={p.label}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{p.label}</p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {p.times.map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={t === time}
                          onClick={() => setTime(t)}
                          className={`rounded-xl py-2 text-sm font-semibold tabular-nums transition ${t === time ? "bg-brand-600 text-white shadow-md shadow-brand-700/20" : "bg-white text-stone-800 ring-1 ring-stone-200 hover:ring-brand-500"}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {store.minNotice && <p className="text-xs text-stone-500">Agendamentos com pelo menos {store.minNotice} de antecedência.</p>}
              </div>
            )}
          </section>
        )}

        <p className="mt-12 text-center text-xs text-stone-400">
          Agendamento online por <a href="https://webtenda.com.br" className="font-medium text-stone-500 hover:text-stone-700">WebTenda</a>
        </p>
      </div>

      {selected.length > 0 && !checkout && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 [background:linear-gradient(to_top,rgb(245_245_244/0.96)_45%,transparent)]">
          <button
            className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3.5 text-left text-white shadow-xl shadow-brand-700/30 transition hover:bg-brand-700 disabled:bg-stone-500 disabled:shadow-none"
            disabled={!ready}
            onClick={() => setCheckout(true)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-white/85">{chosen.map((c) => c.name).join(" + ")} · {formatDuration(duration)}</span>
              <span className="block font-semibold">
                {ready ? `${day!.label.replace(/^./, (c) => c.toUpperCase())} às ${time}${pro ? ` · ${pro.name.split(" ")[0]}` : ""}` : !date ? "Escolha o dia" : "Escolha o horário"}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-base font-bold tabular-nums">{formatBRL(subtotal)}</span>
              {ready && <span className="block text-[13px] font-semibold">Continuar ›</span>}
            </span>
          </button>
        </div>
      )}

      {checkout && slot && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setCheckout(false)}>
          <form action={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Confirmar horário</h2>
              <button type="button" className="text-sm text-stone-500" onClick={() => setCheckout(false)}>Voltar</button>
            </div>
            <div className="rounded-xl bg-brand-50 p-3.5 ring-1 ring-brand-100">
              <p className="text-lg font-bold text-stone-900 first-letter:uppercase">{day!.label.replace(/^(\w+),/, (_, w) => `${w},`)} às {time}</p>
              <p className="text-sm text-stone-700">
                {chosen.map((c) => c.name).join(" + ")} · {formatDuration(duration)}
                {pro ? ` · com ${pro.name.split(" ")[0]}` : slot.professionalIds.length === 1 ? ` · com ${pros.find((p) => p.id === slot.professionalIds[0])?.name.split(" ")[0] ?? ""}` : ""}
              </p>
              {store.address && <p className="mt-1 text-[13px] text-stone-500">📍 {store.address}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input name="customerName" placeholder="Seu nome" className="input" defaultValue={customer?.name ?? ""} autoComplete="name" required />
              <input name="customerPhone" placeholder="Seu WhatsApp com DDD" className="input" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setCoupon(null); }} required />
            </div>
            {customer && <p className="-mt-2 text-xs text-stone-500">Você está como {customer.name.split(" ")[0]}. <Link href={`/loja/${store.slug}/conta`} className="text-brand-700 underline">Não é você?</Link></p>}

            {paymentOptions.length > 1 ? (
              <div>
                <p className="label">Pagamento</p>
                <div className="space-y-2">
                  {paymentOptions.map((o) => (
                    <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-xl p-3 text-sm ring-1 ring-stone-200 has-[:checked]:ring-2 has-[:checked]:ring-brand-600">
                      <input type="radio" name="payment" checked={payment === o.value} onChange={() => setPayment(o.value)} className="accent-brand-600" />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : paymentOptions.length === 1 ? (
              <p className="text-sm text-stone-600">Pagamento: <strong>{paymentOptions[0].label}</strong></p>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Esta barbearia pede um sinal, mas ainda não ligou o pagamento. Chame no WhatsApp para agendar.</p>
            )}
            {payOnline && (
              <div>
                <input name="cpfCnpj" placeholder="Seu CPF" className="input" inputMode="numeric" defaultValue={customer?.cpfCnpj ?? ""} required />
                <p className="mt-1 text-xs text-stone-500">Exigido para o pagamento. {payment === "ONLINE_PIX" ? "O QR Code do Pix aparece na próxima tela." : "Você digita o cartão na próxima tela, em ambiente seguro do Asaas."}</p>
              </div>
            )}
            <textarea name="notes" placeholder="Algum recado? (opcional) Ex.: degradê baixo, só tesoura" className="input" rows={2} />

            {customer?.loyalty?.rewardAvailable && store.reward && (
              <label className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-700">
                <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} />
                <span>★ Usar minha recompensa de fidelidade</span>
              </label>
            )}
            {!rewardActive && (
              <div>
                <div className="flex gap-2">
                  <input placeholder="Cupom de desconto" className="input uppercase" value={couponInput} onChange={(e) => { setCouponInput(e.target.value); setCoupon(null); setCouponError(null); }} />
                  <button type="button" className="btn-ghost" onClick={applyCoupon} disabled={checkingCoupon || !couponInput.trim()}>{checkingCoupon ? "..." : "Aplicar"}</button>
                </div>
                {coupon && <p className="mt-1 text-sm text-green-700">Cupom {coupon.code} aplicado.</p>}
                {couponError && <p className="mt-1 text-sm text-red-600">{couponError}</p>}
              </div>
            )}
            {!customer?.marketingOptIn && (
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" name="marketingOptIn" /> Quero receber promoções pelo WhatsApp
              </label>
            )}

            <div className="space-y-1 border-t border-stone-100 pt-3 text-sm">
              {chosen.map((c) => <div key={c.id} className="flex justify-between"><span>{c.name}</span><span>{formatBRL(c.priceCents)}</span></div>)}
              {discount > 0 && <div className="flex justify-between text-green-700"><span>{rewardActive ? "Recompensa de fidelidade" : `Cupom ${coupon?.code}`}</span><span>−{formatBRL(discount)}</span></div>}
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatBRL(total)}</span></div>
              {deposit && payment !== "IN_PERSON" && (
                <div className="mt-1 space-y-0.5 rounded-lg bg-brand-50 px-3 py-2 text-brand-700">
                  <div className="flex justify-between font-semibold"><span>Sinal para garantir ({store.depositPercent}%)</span><span>{formatBRL(deposit)}</span></div>
                  <div className="flex justify-between text-[13px]"><span>Restante no dia</span><span>{formatBRL(total - deposit)}</span></div>
                </div>
              )}
              {store.cancelText && <p className="pt-1 text-xs text-stone-500">{store.cancelText}</p>}
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="btn w-full py-3 text-base" disabled={pending || paymentOptions.length === 0}>
              {pending ? "Agendando..." : payOnline ? (deposit ? "Agendar e pagar o sinal" : "Agendar e pagar") : "Confirmar agendamento"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <h2 className="flex items-baseline gap-2 px-1">
      <span className="flex h-6 w-6 flex-none translate-y-[-1px] items-center justify-center self-center rounded-full bg-stone-900 text-xs font-bold text-white">{n}</span>
      <span className="text-xl font-bold tracking-tight text-stone-900">{title}</span>
      {hint && <span className="text-sm text-stone-500">{hint}</span>}
    </h2>
  );
}

function ProCard({ active, onClick, name, sub, avatar }: { active: boolean; onClick: () => void; name: string; sub: string; avatar: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex w-28 flex-none flex-col items-center rounded-2xl bg-white px-2 py-3 text-center ring-1 transition ${active ? "ring-2 ring-brand-600 shadow-md shadow-brand-700/10" : "ring-stone-900/5 hover:ring-brand-500"}`}
    >
      <span className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full ${active ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-700"}`}>{avatar}</span>
      <span className="mt-2 block w-full truncate text-sm font-semibold text-stone-900">{name}</span>
      <span className="block w-full truncate text-[11px] text-stone-500">{sub}</span>
    </button>
  );
}

function groupByPeriod(times: string[]) {
  const groups = [
    { label: "Manhã", times: times.filter((t) => t < "12:00") },
    { label: "Tarde", times: times.filter((t) => t >= "12:00" && t < "18:00") },
    { label: "Noite", times: times.filter((t) => t >= "18:00") },
  ];
  return groups.filter((g) => g.times.length);
}

function wide(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname !== "images.unsplash.com") return url;
    u.searchParams.set("w", "1200");
    u.searchParams.set("h", "520");
    return u.toString();
  } catch {
    return url;
  }
}
