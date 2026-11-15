import { db } from "@/lib/db";
import { loadLogo, renderAppIcon, storeColor } from "@/lib/app-icon";

// Ícone que o iPhone usa quando o cliente adiciona o cardápio à tela de início.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function AppleIcon({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { name: true, logoUrl: true, themeColor: true } });
  return await renderAppIcon({
    size: 180,
    maskable: false,
    logo: await loadLogo(store?.logoUrl),
    name: store?.name ?? "WebTenda",
    color: storeColor(store?.themeColor),
  });
}
