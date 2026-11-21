import type { Partner } from "@prisma/client";
import { DEFAULT_COMMISSION_PERCENT } from "@/lib/partner";
import { formatPhone } from "@/lib/phone";

/** Campos do cadastro de parceiro (criar e editar). */
export function PartnerFields({ partner }: { partner?: Partner }) {
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <div><label className="label">Nome</label><input name="name" required defaultValue={partner?.name} className="input" placeholder="Ex.: Maria Souza (social media)" /></div>
      <div>
        <label className="label">Código</label>
        <input name="code" defaultValue={partner?.code} className="input uppercase" placeholder="Vazio = primeiro nome" />
        <p className="mt-1 text-xs text-stone-500">Vai no link e no cadastro. Só letras e números.</p>
      </div>
      <div><label className="label">WhatsApp</label><input name="whatsapp" defaultValue={partner?.whatsapp ? formatPhone(partner.whatsapp) : ""} className="input" placeholder="(62) 99999-0000" /></div>
      <div><label className="label">E-mail</label><input name="email" type="email" defaultValue={partner?.email ?? ""} className="input" /></div>
      <div><label className="label">Chave Pix (para pagar a comissão)</label><input name="pixKey" defaultValue={partner?.pixKey ?? ""} className="input" /></div>
      <div>
        <label className="label">Comissão (% da mensalidade)</label>
        <input name="commissionPercent" type="number" min={0} max={100} required defaultValue={partner?.commissionPercent ?? DEFAULT_COMMISSION_PERCENT} className="input w-28" />
      </div>
      <div className="sm:col-span-2"><label className="label">Anotações</label><textarea name="notes" rows={2} defaultValue={partner?.notes ?? ""} className="input" placeholder="Ex.: agência do Setor Bueno, combinou montar as lojas" /></div>
    </div>
  );
}
