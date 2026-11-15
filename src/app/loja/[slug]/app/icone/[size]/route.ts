import { db } from "@/lib/db";
import { loadLogo, renderAppIcon, storeColor } from "@/lib/app-icon";

const VARIANTS: Record<string, { size: number; maskable: boolean }> = {
  "180": { size: 180, maskable: false }, // iPhone
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "512-maskable": { size: 512, maskable: true }, // Android recorta no formato do aparelho
};

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; size: string }> }) {
  const { slug, size } = await params;
  const variant = VARIANTS[size];
  if (!variant) return new Response("Tamanho inválido", { status: 404 });
  const store = await db.store.findUnique({ where: { slug }, select: { name: true, logoUrl: true, themeColor: true } });
  if (!store) return new Response("Loja não encontrada", { status: 404 });

  const img = await renderAppIcon({ ...variant, logo: await loadLogo(store.logoUrl), name: store.name, color: storeColor(store.themeColor) });
  img.headers.set("cache-control", "public, max-age=86400");
  return img;
}
