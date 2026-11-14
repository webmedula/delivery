import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { courierUrl } from "@/lib/store-url";
import { brDayStart } from "@/lib/delivery";
import { CourierForm } from "@/components/CourierForm";
import { deleteCourier, resetCourierLink, toggleCourier } from "../actions";

export const dynamic = "force-dynamic";

export default async function CouriersPage() {
  const { storeId, store } = await requireStoreUser();
  const couriers = await db.courier.findMany({ where: { storeId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  const today = brDayStart();
  const [onRoute, doneToday] = await Promise.all([
    db.order.groupBy({ by: ["courierId"], where: { storeId, status: "OUT_FOR_DELIVERY", courierId: { not: null } }, _count: true }),
    db.order.groupBy({ by: ["courierId"], where: { storeId, status: "COMPLETED", completedAt: { gte: today }, courierId: { not: null } }, _count: true }),
  ]);
  const count = (rows: typeof onRoute, id: string) => rows.find((r) => r.courierId === id)?._count ?? 0;
  const links = new Map(await Promise.all(couriers.map(async (c) => [c.id, await courierUrl(c.token)] as const)));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Entregadores</h1>
      <p className="text-sm text-stone-600">
        Cada entregador recebe um link só dele, que abre no celular sem senha. Lá ele vê os pedidos que você passou para ele,
        abre a rota no Google Maps ou no Waze, vê quanto cobrar e marca &quot;Saí para entrega&quot; e &quot;Entreguei&quot;.
        O quadro de pedidos e o cliente são atualizados na hora.
      </p>
      <CourierForm />
      {couriers.length === 0 ? (
        <p className="card text-center text-sm text-stone-500">Nenhum entregador cadastrado ainda.</p>
      ) : (
        <ul className="space-y-3">
          {couriers.map((c) => {
            const link = links.get(c.id)!;
            const invite = `Olá, ${c.name.split(" ")[0]}! Este é o seu link de entregas da ${store.name}. Guarde nos favoritos do celular: ${link}`;
            return (
              <li key={c.id} className={`card space-y-3 ${c.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-lg font-semibold">{c.name}</span>
                  <span className="text-sm text-stone-500">{formatPhone(c.phone)}</span>
                  {!c.active && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs">pausado</span>}
                  <span className="ml-auto text-sm text-stone-600">
                    {count(onRoute, c.id)} em rota · {count(doneToday, c.id)} entregue(s) hoje
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <a href={whatsappLink(c.phone, invite)} target="_blank" rel="noopener" className="rounded-lg border border-green-600/30 bg-green-50 px-3 py-2 font-medium text-green-800 hover:bg-green-100">
                    Enviar o link no WhatsApp
                  </a>
                  <a href={link} target="_blank" className="btn-ghost">Abrir a página dele</a>
                  <form action={toggleCourier}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost">{c.active ? "Pausar" : "Ativar"}</button></form>
                  <details className="w-full">
                    <summary className="cursor-pointer text-stone-500">Mais opções</summary>
                    <p className="mt-2 break-all text-xs text-stone-500">Link: {link}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <form action={resetCourierLink}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost">Trocar o link (o antigo para de funcionar)</button></form>
                      <form action={deleteCourier}><input type="hidden" name="id" value={c.id} /><button className="px-3 py-2 text-red-600 hover:underline">Excluir entregador</button></form>
                    </div>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
