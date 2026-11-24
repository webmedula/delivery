import type { MetadataRoute } from "next";

// As telas internas não são bloqueadas aqui de propósito: o Google precisa conseguir abri-las
// para ver o "noindex" (next.config.ts) e tirá-las do índice. Só a API fica de fora.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" } };
}
