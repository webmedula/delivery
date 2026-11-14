import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { renderCampaignMessage } from "@/lib/campaign-message";
import { storeUrl } from "@/lib/store-url";
import { SendButton } from "@/components/CampaignForms";
import { deleteCampaign, optOutCustomer, skipRecipient } from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { store, storeId } = await requireStoreUser();
  const campaign = await db.campaign.findFirst({
    where: { id: (await params).id, storeId },
    include: { coupon: true, recipients: { include: { customer: true }, orderBy: { customer: { name: "asc" } } } },
  });
  if (!campaign) notFound();
  const link = await storeUrl(store.slug);
  const items = campaign.recipients.map((r) => {
    const text = renderCampaignMessage(campaign.message, { name: r.customer.name, store: store.name, link, coupon: campaign.coupon?.code });
    // Quem pediu para sair depois da criação não recebe mais.
    const blocked = !r.customer.marketingOptIn;
    return { ...r, text, href: whatsappLink(r.customer.phone, text), blocked };
  });
  const pending = items.filter((i) => !i.sentAt && !i.skipped && !i.blocked);
  const sent = items.filter((i) => i.sentAt).length;
  const next = pending[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/painel/campanhas" className="text-sm text-brand-700">← Campanhas</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-stone-500">{sent} de {items.length} enviadas{campaign.coupon ? ` · cupom ${campaign.coupon.code}` : ""}</p>
        </div>
        <form action={deleteCampaign}><input type="hidden" name="id" value={campaign.id} /><button className="text-sm text-red-600 hover:underline">Excluir campanha</button></form>
      </div>

      {next ? (
        <div className="card space-y-3">
          <p className="text-sm text-stone-500">Próximo envio · faltam {pending.length}</p>
          <p className="font-semibold">{next.customer.name} · {formatPhone(next.customer.phone)}</p>
          <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-[#dcf8c6] px-3 py-2 text-sm text-stone-800">{next.text}</div>
          <SendButton recipientId={next.id} href={next.href} label="Abrir WhatsApp e enviar" big />
          <p className="text-xs text-stone-500">O WhatsApp abre com a mensagem pronta. Toque em enviar lá e volte aqui: o próximo cliente já vai estar esperando.</p>
        </div>
      ) : (
        <div className="card text-center text-sm text-green-700">Campanha concluída: todas as mensagens foram enviadas. 🎉</div>
      )}

      <div className="card p-0">
        <h2 className="px-5 pt-4 font-semibold">Clientes da campanha</h2>
        <ul className="divide-y divide-stone-100">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{i.customer.name}</p>
                <p className="text-stone-500">{formatPhone(i.customer.phone)}</p>
              </div>
              {i.blocked ? (
                <span className="text-xs text-stone-500">Pediu para sair</span>
              ) : i.sentAt ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Enviada</span>
              ) : i.skipped ? (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">Pulada</span>
              ) : null}
              {!i.blocked && !i.sentAt && (
                <>
                  {!i.skipped && <SendButton recipientId={i.id} href={i.href} />}
                  <form action={skipRecipient}><input type="hidden" name="id" value={i.id} /><button className="text-stone-600 hover:underline">{i.skipped ? "Voltar à fila" : "Pular"}</button></form>
                </>
              )}
              {!i.blocked && (
                <form action={optOutCustomer}>
                  <input type="hidden" name="customerId" value={i.customerId} />
                  <button className="text-red-600 hover:underline" title="Use quando o cliente responder SAIR">Respondeu SAIR</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
