import Link from "next/link";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { describeDiscount } from "@/lib/discounts";
import { storeUrl } from "@/lib/store-url";
import { CampaignForm } from "@/components/CampaignForms";
import { AUDIENCES } from "@/lib/campaign-message";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { store, storeId } = await requireStoreUser();
  const now = new Date();
  const [campaigns, coupons, optIn] = await Promise.all([
    db.campaign.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { recipients: true } }, recipients: { where: { sentAt: { not: null } }, select: { id: true } } },
    }),
    db.coupon.findMany({ where: { storeId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { createdAt: "desc" } }),
    db.customer.count({ where: { storeId, marketingOptIn: true } }),
  ]);
  const audienceLabel = (a: string) => AUDIENCES.find((x) => x.key === a.split(":")[0])?.label + (a.startsWith("inactive:") ? ` (${a.split(":")[1]}+ dias)` : "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Enviar promoções</h1>
        <p className="text-sm text-stone-600">
          As mensagens saem do WhatsApp da sua loja, uma por cliente, com o texto já pronto: é só tocar em enviar.
          Assim você não paga por mensagem e não corre risco de bloqueio por disparo em massa.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {optIn === 0 ? (
          <div className="card text-sm text-stone-600">
            Nenhum cliente aceitou receber promoções ainda. Eles marcam essa opção na sacola, ao fazer o pedido, ou em "Minha conta".
          </div>
        ) : (
          <CampaignForm
            coupons={coupons.map((c) => ({ id: c.id, code: c.code, label: `${c.code} · ${describeDiscount(c)}` }))}
            storeName={store.name}
            link={await storeUrl(store.slug)}
            loyaltyEnabled={store.loyaltyEnabled}
          />
        )}
        <div className="card space-y-3 self-start">
          <h2 className="font-semibold">Campanhas</h2>
          {campaigns.length === 0 && <p className="text-sm text-stone-500">Nenhuma campanha ainda.</p>}
          <ul className="divide-y divide-stone-100">
            {campaigns.map((c) => {
              const sent = c.recipients.length, total = c._count.recipients;
              return (
                <li key={c.id} className="py-3">
                  <Link href={`/painel/campanhas/${c.id}`} className="block space-y-1">
                    <div className="flex justify-between gap-2"><span className="font-medium">{c.name}</span><span className="text-sm text-stone-500">{sent}/{total} enviadas</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full bg-brand-600" style={{ width: `${total ? (sent / total) * 100 : 0}%` }} /></div>
                    <p className="text-xs text-stone-500">{audienceLabel(c.audience)} · {c.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
