"use client";

import { useActionState } from "react";
import { updateStoreSettings } from "@/app/painel/actions";

type Values = {
  name: string; description: string; whatsapp: string; address: string; pixKey: string; logoUrl: string; themeColor: string;
  deliveryFee: string; minOrder: string; acceptsDelivery: boolean; acceptsPickup: boolean; isOpen: boolean;
  deliveryMinutesMin: string; deliveryMinutesMax: string; pickupMinutesMin: string; pickupMinutesMax: string;
  hasZones: boolean;
};

export function StoreSettingsForm({ store }: { store: Values }) {
  const [state, action, pending] = useActionState(updateStoreSettings, undefined);
  return (
    <form action={action} className="card space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="isOpen" defaultChecked={store.isOpen} /> Loja aberta para pedidos agora
      </label>
      <div><label className="label">Nome</label><input name="name" defaultValue={store.name} className="input" required /></div>
      <div><label className="label">Descrição</label><textarea name="description" defaultValue={store.description} className="input" rows={2} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">WhatsApp (com DDI)</label><input name="whatsapp" defaultValue={store.whatsapp} placeholder="5511999999999" className="input" /></div>
        <div><label className="label">Chave Pix</label><input name="pixKey" defaultValue={store.pixKey} className="input" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div><label className="label">Logo (URL da imagem, opcional)</label><input name="logoUrl" defaultValue={store.logoUrl} placeholder="https://..." className="input" /></div>
        <div>
          <label className="label">Cor do cardápio</label>
          <input type="color" name="themeColor" defaultValue={store.themeColor || "#ea580c"} className="h-10 w-20 cursor-pointer rounded-lg border border-stone-300 bg-white p-1" />
        </div>
      </div>
      <div><label className="label">Endereço</label><input name="address" defaultValue={store.address} className="input" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Taxa de entrega (R$)</label>
          <input name="deliveryFee" defaultValue={store.deliveryFee} className="input" inputMode="decimal" />
          {store.hasZones && <p className="mt-1 text-xs text-stone-500">Você cobra por bairro (abaixo), então esta taxa única não é usada.</p>}
        </div>
        <div><label className="label">Pedido mínimo (R$)</label><input name="minOrder" defaultValue={store.minOrder} className="input" inputMode="decimal" /></div>
      </div>
      <fieldset className="space-y-2">
        <legend className="label">Tempo estimado mostrado ao cliente (em minutos)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-16">Entrega</span>
            <input name="deliveryMinutesMin" defaultValue={store.deliveryMinutesMin} placeholder="40" className="input w-20!" inputMode="numeric" />
            a
            <input name="deliveryMinutesMax" defaultValue={store.deliveryMinutesMax} placeholder="60" className="input w-20!" inputMode="numeric" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-16">Retirada</span>
            <input name="pickupMinutesMin" defaultValue={store.pickupMinutesMin} placeholder="20" className="input w-20!" inputMode="numeric" />
            a
            <input name="pickupMinutesMax" defaultValue={store.pickupMinutesMax} placeholder="30" className="input w-20!" inputMode="numeric" />
          </div>
        </div>
        <p className="text-xs text-stone-500">Deixe em branco para não mostrar. O cliente vê, por exemplo, &quot;Entrega em 40 a 60 min&quot; no cardápio e a previsão de chegada no pedido.</p>
      </fieldset>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="acceptsDelivery" defaultChecked={store.acceptsDelivery} /> Entrega</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="acceptsPickup" defaultChecked={store.acceptsPickup} /> Retirada</label>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">Salvo.</p>}
      <button className="btn" disabled={pending}>{pending ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}
