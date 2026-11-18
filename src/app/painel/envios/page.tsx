import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ShippingSettings } from "@/components/ShippingSettings";

export const dynamic = "force-dynamic";

const money = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const num = (n: number | null) => (n === null ? "" : String(n));

export default async function ShippingPage() {
  const { store } = await requireStoreUser();
  const methods = await db.shippingMethod.findMany({ where: { storeId: store.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Envios</h1>
        <p className="text-sm text-stone-600">
          Venda para outras cidades e estados. Monte sua tabela de frete por destino: o cliente digita o CEP no {store.businessType === "RETAIL" ? "catálogo" : "cardápio"} e vê o valor e o prazo na hora.
        </p>
      </div>
      <ShippingSettings
        initial={{
          acceptsShipping: store.acceptsShipping,
          originUf: store.shippingOriginUf ?? "",
          freeAbove: money(store.shippingFreeAboveCents),
          methods: methods.map((m) => ({
            id: m.id, name: m.name, active: m.active,
            sameState: money(m.sameStateCents), southeast: money(m.southeastCents), south: money(m.southCents),
            midwest: money(m.midwestCents), northeast: money(m.northeastCents), north: money(m.northCents),
            daysMin: num(m.daysMin), daysMax: num(m.daysMax),
          })),
        }}
      />
      <div className="card space-y-2 text-sm text-stone-600">
        <p className="font-medium text-stone-800">Como funciona depois da venda</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>O pedido chega em Pedidos com o endereço completo e a forma de envio escolhida.</li>
          <li>Separe as peças, poste nos Correios (ou entregue à transportadora) e toque em <b>Marcar como enviado</b>, colando o código de rastreio.</li>
          <li>Envie para a cliente a mensagem pronta pelo WhatsApp, com o código e o link de rastreio. A página do pedido dela também mostra o código.</li>
        </ol>
      </div>
    </div>
  );
}
