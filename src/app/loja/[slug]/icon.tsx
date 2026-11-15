import { db } from "@/lib/db";
import { loadLogo, renderAppIcon, storeColor } from "@/lib/app-icon";

// Ícone da aba do navegador no cardápio: o logo da loja no lugar do da WebTenda.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Icon({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { name: true, logoUrl: true, themeColor: true } });
  return await renderAppIcon({
    size: 64,
    maskable: false,
    tab: true,
    logo: await loadLogo(store?.logoUrl),
    name: store?.name ?? "WebTenda",
    color: storeColor(store?.themeColor),
  });
}
