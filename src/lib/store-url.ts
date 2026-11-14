import "server-only";
import { headers } from "next/headers";

/** Endereço público do cardápio, a partir do domínio em que o painel está aberto. */
export async function storeUrl(slug: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.webtenda.com.br";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/loja/${slug}`;
}
