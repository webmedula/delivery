import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/auth";
import { ImageError, saveUploadedImage, type ImageKind } from "@/lib/images";

export const dynamic = "force-dynamic";

/** Envio de foto pelo painel (produto ou logo). Responde { url } ou { error }. */
export async function POST(req: Request) {
  // Só aceita envio feito pelo próprio painel (mesmo domínio).
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });

  const { store } = await requireStoreUser();
  if (store.isDemo) return NextResponse.json({ error: "Na loja demo o envio de fotos fica desligado. Use um link de foto." }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind: ImageKind = form?.get("kind") === "logo" ? "logo" : "product";
  if (!(file instanceof File)) return NextResponse.json({ error: "Escolha uma foto." }, { status: 400 });
  try {
    const url = await saveUploadedImage(store.id, file, kind);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof ImageError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
