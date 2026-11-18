import { db } from "@/lib/db";
import { imageIdFromUrl } from "@/lib/image-url";

/** Foto enviada pelo painel. O id nunca muda de conteúdo, então o navegador pode guardar por um ano. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = imageIdFromUrl(`/img/${file}`);
  const img = id ? await db.storedImage.findUnique({ where: { id }, select: { mime: true, data: true } }) : null;
  if (!img) return new Response("Foto não encontrada.", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  return new Response(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mime,
      "Content-Length": String(img.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
