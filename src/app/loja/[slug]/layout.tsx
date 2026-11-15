import "@fontsource-variable/outfit";
import type { Metadata, Viewport } from "next";
import { db } from "@/lib/db";
import { themeStyle } from "@/lib/theme";
import { storeColor } from "@/lib/app-icon";
import { RegisterServiceWorker } from "@/components/InstallApp";

type Props = { params: Promise<{ slug: string }> };

const getStore = (slug: string) => db.store.findUnique({ where: { slug }, select: { name: true, themeColor: true } });

// Cada cardápio pode ser instalado como app no celular, com nome, ícone e cor da loja.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStore(slug);
  if (!store) return {};
  return {
    manifest: `/loja/${slug}/app/manifest`,
    applicationName: store.name,
    appleWebApp: { capable: true, title: store.name, statusBarStyle: "default" },
    formatDetection: { telephone: false },
    // iPhones mais antigos só abrem em tela cheia (sem a barra do Safari) com esta marcação.
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const store = await getStore((await params).slug);
  return { themeColor: storeColor(store?.themeColor), viewportFit: "cover" };
}

// Aplica a cor e a fonte da loja em todas as telas do cardápio (cardápio, conta, pedido).
export default async function StoreLayout({ children, params }: { children: React.ReactNode } & Props) {
  const store = await getStore((await params).slug);
  return (
    <div style={{ ...themeStyle(store?.themeColor), fontFamily: "'Outfit Variable', ui-sans-serif, system-ui, sans-serif" }}>
      {children}
      <RegisterServiceWorker />
    </div>
  );
}
