import { db } from "@/lib/db";
import { themeStyle } from "@/lib/theme";

// Aplica a cor da loja em todas as telas do cardápio (cardápio, conta, pedido).
export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const store = await db.store.findUnique({ where: { slug: (await params).slug }, select: { themeColor: true } });
  return <div style={themeStyle(store?.themeColor)}>{children}</div>;
}
