"use client";

import { useActionState, useState } from "react";
import { createPaymentAccount, updateOnlineMethods } from "@/app/painel/actions";
import { keepOnSubmit } from "./useKeepForm";

export function PaymentAccountForm({ defaults }: { defaults: { name: string; email: string; cpfCnpj: string; mobilePhone: string } }) {
  const [state, action, pending] = useActionState(createPaymentAccount, undefined);
  const [doc, setDoc] = useState(defaults.cpfCnpj);
  const isCompany = doc.replace(/\D/g, "").length > 11;
  return (
    <form onSubmit={keepOnSubmit(action)} className="card space-y-4">
      <h2 className="font-semibold">Dados para abrir a conta de recebimento</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">CPF ou CNPJ</label>
          <input name="cpfCnpj" className="input" inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} required />
        </div>
        {isCompany ? (
          <div>
            <label className="label">Tipo de empresa</label>
            <select name="companyType" className="input" defaultValue="MEI">
              <option value="MEI">MEI</option>
              <option value="LIMITED">Limitada (LTDA)</option>
              <option value="INDIVIDUAL">Individual (EI / SLU)</option>
              <option value="ASSOCIATION">Associação</option>
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Data de nascimento</label>
            <input name="birthDate" type="date" className="input" required />
          </div>
        )}
      </div>
      <div>
        <label className="label">{isCompany ? "Razão social" : "Nome completo"}</label>
        <input name="name" className="input" defaultValue={defaults.name} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">E-mail</label>
          <input name="email" type="email" className="input" defaultValue={defaults.email} required />
          <p className="mt-1 text-xs text-stone-500">O Asaas manda para este e-mail o acesso à sua conta.</p>
        </div>
        <div>
          <label className="label">Celular com DDD</label>
          <input name="mobilePhone" className="input" inputMode="tel" defaultValue={defaults.mobilePhone} required />
        </div>
      </div>
      <div className="max-w-xs">
        <label className="label">{isCompany ? "Faturamento mensal (R$)" : "Renda mensal (R$)"}</label>
        <input name="income" className="input" inputMode="decimal" placeholder="5.000,00" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">CEP</label><input name="postalCode" className="input" inputMode="numeric" required /></div>
        <div className="sm:col-span-2"><label className="label">Endereço (rua)</label><input name="address" className="input" required /></div>
        <div><label className="label">Número</label><input name="addressNumber" className="input" required /></div>
        <div><label className="label">Complemento</label><input name="complement" className="input" /></div>
        <div><label className="label">Bairro</label><input name="province" className="input" required /></div>
      </div>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Criando conta..." : "Criar conta de recebimento"}</button>
    </form>
  );
}

export function OnlineMethodsForm({ pix, card, allowed }: { pix: boolean; card: boolean; allowed: boolean }) {
  const [state, action, pending] = useActionState(updateOnlineMethods, undefined);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Formas de pagamento no cardápio</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pix" defaultChecked={pix} disabled={!allowed} /> Pix online (QR Code na hora, confirmação automática)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="card" defaultChecked={card} disabled={!allowed} /> Cartão de crédito online
      </label>
      <p className="text-xs text-stone-500">Dinheiro e cartão na entrega continuam disponíveis para o cliente.</p>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Salvo.</p>}
      <button className="btn" disabled={pending || !allowed}>{pending ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}
