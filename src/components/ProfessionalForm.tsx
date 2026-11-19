"use client";

import { useActionState, useEffect, useState } from "react";
import { saveProfessional } from "@/app/painel/profissionais/actions";
import { WEEKDAYS } from "@/lib/preorder";
import { PhotoPicker } from "./PhotoPicker";

export type EditablePro = {
  id: string; name: string; phone: string; photoUrl: string | null; workHours: string[];
  breakStart: string | null; breakEnd: string | null; serviceIds: string[]; commissionPercent: number | null;
};

const DEFAULT_HOURS = ["", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-19:00", "08:00-14:00"];
// Segunda primeiro, domingo no fim (como as barbearias pensam a semana).
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Cadastro e edição do profissional: expediente de cada dia, almoço, serviços e comissão. */
export function ProfessionalForm({ pro, services, onSaved }: { pro?: EditablePro; services: { id: string; name: string }[]; onSaved?: () => void }) {
  const [state, action, pending] = useActionState(saveProfessional, undefined);
  const [photo, setPhoto] = useState<string[]>(pro?.photoUrl ? [pro.photoUrl] : []);
  const hours = pro?.workHours ?? DEFAULT_HOURS;
  const all = !pro || pro.serviceIds.length === 0;
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (!state?.ok) return;
    if (pro) onSaved?.();
    else {
      setPhoto([]);
      setFormKey((k) => k + 1);
    }
  }, [state, pro, onSaved]);

  return (
    <form key={formKey} action={action} className="space-y-4">
      {pro && <input type="hidden" name="id" value={pro.id} />}
      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <div>
          <PhotoPicker value={photo} onChange={setPhoto} kind="logo" shape="square" />
          <input type="hidden" name="photoUrl" value={photo[0] ?? ""} />
        </div>
        <div className="space-y-3">
          <input name="name" defaultValue={pro?.name} placeholder="Nome, ex.: Rafael" className="input" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="phone" defaultValue={pro?.phone} placeholder="WhatsApp (opcional)" className="input" inputMode="tel" />
            <input name="commissionPercent" defaultValue={pro?.commissionPercent ?? ""} placeholder="Comissão % (opcional)" className="input" inputMode="decimal" />
          </div>
        </div>
      </div>
      <fieldset>
        <legend className="label">Dias e horário de trabalho</legend>
        <div className="space-y-1.5">
          {ORDER.map((d) => {
            const [start, end] = (hours[d] || "").split("-");
            return (
              <div key={d} className="flex items-center gap-2 text-sm">
                <label className="flex w-28 items-center gap-2">
                  <input type="checkbox" name={`works${d}`} defaultChecked={!!hours[d]} className="accent-brand-600" /> {WEEKDAYS[d]}
                </label>
                <input type="time" name={`start${d}`} defaultValue={start || "09:00"} className="input w-28! py-1.5!" />
                <span className="text-stone-400">às</span>
                <input type="time" name={`end${d}`} defaultValue={end || "19:00"} className="input w-28! py-1.5!" />
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="label mb-0!">Almoço / intervalo</span>
        <input type="time" name="breakStart" defaultValue={pro ? (pro.breakStart ?? "") : "12:00"} className="input w-28! py-1.5!" />
        <span className="text-stone-400">às</span>
        <input type="time" name="breakEnd" defaultValue={pro ? (pro.breakEnd ?? "") : "13:00"} className="input w-28! py-1.5!" />
        <span className="text-xs text-stone-500">(apague para não ter intervalo)</span>
      </div>
      {services.length > 0 && (
        <fieldset>
          <legend className="label">Serviços que faz</legend>
          <div className="flex flex-wrap gap-1.5">
            {services.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="checkbox" name="serviceIds" value={s.id} defaultChecked={all || pro!.serviceIds.includes(s.id)} className="accent-brand-600" />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && !pro && <p className="text-sm text-green-700">Profissional cadastrado.</p>}
      <button className="btn" disabled={pending}>{pending ? "Salvando..." : pro ? "Salvar" : "Cadastrar profissional"}</button>
    </form>
  );
}

/** Profissional na lista, com o formulário de edição que abre no lugar. */
export function ProfessionalEditor({ pro, services, children }: { pro: EditablePro; services: { id: string; name: string }[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {children}
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-sm font-medium text-brand-700 hover:underline">
        {open ? "Fechar edição" : "Editar horários e serviços"}
      </button>
      {open && (
        <div className="mt-3 rounded-xl border border-stone-200 p-3">
          <ProfessionalForm pro={pro} services={services} onSaved={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
