import { db } from "@/lib/db";
import { storeColor } from "@/lib/app-icon";

// "Ficha" do app da loja: é o que o celular lê para instalar o cardápio na tela inicial
// com o nome, o ícone e a cor da própria loja, abrindo direto no cardápio dela.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { name: true, description: true, themeColor: true, updatedAt: true } });
  if (!store) return new Response("Loja não encontrada", { status: 404 });

  const base = `/loja/${slug}`;
  const v = store.updatedAt.getTime().toString(36); // troca o endereço do ícone quando a loja muda o logo
  const manifest = {
    id: base,
    name: store.name,
    short_name: store.name.length > 14 ? store.name.split(/\s+/).slice(0, 2).join(" ").slice(0, 14) : store.name,
    description: store.description ?? `Cardápio e pedidos da ${store.name}`,
    lang: "pt-BR",
    start_url: `${base}?origem=app`,
    scope: base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f4",
    theme_color: storeColor(store.themeColor),
    icons: [
      { src: `${base}/app/icone/192?v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/app/icone/512?v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/app/icone/512-maskable?v=${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
