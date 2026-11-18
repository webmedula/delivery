// Fotos enviadas pelo painel. Ficam no Postgres (tabela StoredImage), que já tem backup.
// Toda foto passa pelo sharp: gira conforme o celular, reduz, converte para WebP e perde
// os metadados (inclusive a localização do GPS que o celular grava na foto).

import "server-only";
import sharp, { type OutputInfo } from "sharp";
import { db } from "./db";
import { imageIdFromUrl, storedImageUrl } from "./image-url";

export { imageIdFromUrl, storedImageUrl };

export type ImageKind = "product" | "logo";

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES_PER_STORE = 3000;
const SIZES: Record<ImageKind, number> = { product: 1600, logo: 512 };

export class ImageError extends Error {}

/** Recebe o arquivo enviado, trata e grava. Devolve o endereço público da foto. */
export async function saveUploadedImage(storeId: string, file: File, kind: ImageKind) {
  if (file.size === 0) throw new ImageError("Arquivo vazio.");
  if (file.size > MAX_INPUT_BYTES) throw new ImageError("A foto é grande demais (máximo 15 MB).");
  const count = await db.storedImage.count({ where: { storeId } });
  if (count >= MAX_IMAGES_PER_STORE) throw new ImageError("Sua loja chegou ao limite de fotos. Apague produtos antigos para liberar espaço.");

  const input = Buffer.from(await file.arrayBuffer());
  let out: { data: Buffer; info: OutputInfo };
  try {
    const img = sharp(input, { limitInputPixels: 60_000_000, failOn: "error" });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new ImageError("Não foi possível ler a foto.");
    const max = SIZES[kind];
    out = await img
      .rotate()
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: kind === "logo" ? 90 : 80 })
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError("Formato de foto não suportado. Envie em JPG, PNG ou WebP.");
  }

  const saved = await db.storedImage.create({
    data: { storeId, mime: "image/webp", width: out.info.width, height: out.info.height, size: out.data.length, data: new Uint8Array(out.data) },
    select: { id: true },
  });
  return storedImageUrl(saved.id);
}

/**
 * Apaga as fotos da loja que estavam em `before` e não estão mais em uso
 * (em nenhum produto, nem como logo). Links externos são ignorados.
 */
export async function deleteUnusedImages(storeId: string, before: (string | null | undefined)[]) {
  const ids = [...new Set(before.map(imageIdFromUrl).filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  const urls = ids.map(storedImageUrl);
  const [products, store] = await Promise.all([
    db.product.findMany({
      where: { storeId, OR: [{ imageUrl: { in: urls } }, { images: { hasSome: urls } }] },
      select: { imageUrl: true, images: true },
    }),
    db.store.findUnique({ where: { id: storeId }, select: { logoUrl: true } }),
  ]);
  const used = new Set<string>([...products.flatMap((p) => [p.imageUrl, ...p.images]), store?.logoUrl].filter((u): u is string => !!u));
  const unused = ids.filter((id) => !used.has(storedImageUrl(id)));
  if (unused.length) await db.storedImage.deleteMany({ where: { storeId, id: { in: unused } } });
}

/**
 * Fotos enviadas há mais de um dia que nunca foram salvas em produto ou logo
 * (a pessoa escolheu a foto e desistiu do cadastro). Roda depois de salvar um produto.
 */
export async function deleteAbandonedImages(storeId: string) {
  const old = await db.storedImage.findMany({
    where: { storeId, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
    select: { id: true },
  });
  if (old.length) await deleteUnusedImages(storeId, old.map((i) => storedImageUrl(i.id)));
}

/** Lê a foto gravada (para o ícone do app, que precisa dos bytes). */
export async function readStoredImage(url: string) {
  const id = imageIdFromUrl(url);
  if (!id) return null;
  return db.storedImage.findUnique({ where: { id }, select: { mime: true, data: true } });
}
