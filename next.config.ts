import type { NextConfig } from "next";

// Telas do sistema que não devem aparecer no Google: login, painel, administração,
// links de pedido, entregador, mesa etc. O cabeçalho X-Robots-Tag tem o mesmo efeito
// da marcação "noindex", mas vale também para respostas que não são HTML (redirecionamentos, API).
// Os cardápios públicos (/loja/[slug] e /loja/[slug]/produto/[id]) continuam indexáveis,
// exceto os das lojas demo (ver generateMetadata desses arquivos).
const NOINDEX_PATHS = [
  "/", // apresentação do sistema; a página de vendas oficial é webtenda.com.br
  "/entrar",
  "/cadastro/:path*",
  "/painel/:path*",
  "/admin/:path*",
  "/api/:path*",
  "/entregador/:path*",
  "/imprimir/:path*",
  "/google-agenda/:path*",
  "/loja/:slug/conta/:path*",
  "/loja/:slug/pedido/:path*",
  "/loja/:slug/agendamento/:path*",
  "/loja/:slug/mesa/:path*",
  "/loja/:slug/app/:path*",
];

const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async headers() {
    return NOINDEX_PATHS.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }));
  },
};

export default nextConfig;
