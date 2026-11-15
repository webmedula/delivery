"use client";

import { assignCourier } from "@/app/painel/actions";

/** Escolhe o entregador do pedido; salva assim que muda. */
export function CourierPicker({ orderId, courierId, couriers }: { orderId: string; courierId: string | null; couriers: { id: string; name: string }[] }) {
  return (
    <form action={assignCourier} className="flex items-center gap-2 text-sm">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="whitespace-nowrap text-stone-600" htmlFor={`courier-${orderId}`}>Entregador</label>
      <select
        id={`courier-${orderId}`}
        name="courierId"
        defaultValue={courierId ?? ""}
        className="input py-1.5!"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">Escolher...</option>
        {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <noscript><button className="btn-ghost">OK</button></noscript>
    </form>
  );
}
