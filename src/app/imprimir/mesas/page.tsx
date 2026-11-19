import type { Metadata } from "next";
import Link from "next/link";
import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/store-url";
import { qrSvg } from "@/lib/qr";
import { compareTableLabels, tablePath } from "@/lib/tables";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "QR codes das mesas", robots: { index: false, follow: false } };

/** Folha para imprimir: um cartão por mesa com o QR code, 4 por página A4. Fica fora do layout do painel. */
export default async function PrintTablesPage({ searchParams }: { searchParams: Promise<{ mesa?: string }> }) {
  const { storeId, store } = await requireStoreUser();
  const { mesa } = await searchParams;
  const tables = (await db.diningTable.findMany({ where: { storeId, active: true, ...(mesa ? { id: mesa } : {}) } })).sort((a, b) =>
    compareTableLabels(a.label, b.label),
  );
  const base = await siteUrl();
  const cards = await Promise.all(tables.map(async (t) => ({ ...t, qr: await qrSvg(`${base}${tablePath(store.slug, t.code)}`, { margin: 0 }) })));
  const color = store.themeColor ?? "#ea580c";

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-6 print:p-0">
      <style>{`@page { size: A4; margin: 10mm; } @media print { body { background: white; } }`}</style>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/painel/mesas" className="btn-ghost">‹ Voltar às mesas</Link>
        <p className="flex-1 text-sm text-stone-600">
          {cards.length === 1 ? "1 cartão" : `${cards.length} cartões`}, 4 por folha A4. Recorte e coloque em um display de mesa ou cole na mesa com plástico por cima.
        </p>
        <PrintButton />
      </div>
      {cards.length === 0 && <p className="text-center text-stone-500 print:hidden">Nenhuma mesa ligada para imprimir.</p>}
      <div className="grid grid-cols-2 gap-[6mm]">
        {cards.map((t) => (
          <section
            key={t.id}
            className="flex h-[132mm] break-inside-avoid flex-col items-center justify-between rounded-[5mm] border-[0.6mm] border-dashed border-stone-300 p-[7mm] text-center"
          >
            <div className="flex items-center gap-[3mm]">
              {store.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logoUrl} alt="" className="h-[11mm] w-[11mm] rounded-[2mm] object-cover" />
              )}
              <p className="text-[5mm] font-bold leading-tight text-stone-900">{store.name}</p>
            </div>
            <p className="rounded-full px-[5mm] py-[1.2mm] text-[7mm] font-extrabold tracking-tight text-white" style={{ backgroundColor: color }}>
              {t.label}
            </p>
            <div className="h-[56mm] w-[56mm] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: t.qr }} />
            <div>
              <p className="text-[4.6mm] font-bold text-stone-900">Peça pelo celular</p>
              <p className="mt-[1mm] text-[3.4mm] leading-snug text-stone-600">Aponte a câmera para o código, escolha e pronto: o pedido vai direto para a cozinha.</p>
            </div>
            <p className="text-[2.6mm] text-stone-400">Cardápio digital WebTenda</p>
          </section>
        ))}
      </div>
    </main>
  );
}
