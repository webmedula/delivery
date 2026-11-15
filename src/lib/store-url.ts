import "server-only";
import { headers } from "next/headers";

/** Endereço público do sistema, a partir do domínio em que o painel está aberto. */
export async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.webtenda.com.br";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Endereço público do cardápio. */
export async function storeUrl(slug: string) {
  return `${await siteUrl()}/loja/${slug}`;
}

/** Link secreto do entregador. */
export async function courierUrl(token: string) {
  return `${await siteUrl()}/entregador/${token}`;
}
