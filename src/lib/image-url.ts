// Endereço das fotos enviadas pelo painel. Sem dependência de servidor, para usar no navegador também.

const PREFIX = "/img/";

export function storedImageUrl(id: string) {
  return `${PREFIX}${id}.webp`;
}

/** Id da foto se o endereço é de uma foto enviada ao sistema ("/img/abc.webp"), senão null. */
export function imageIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^\/img\/([a-z0-9]{20,40})\.webp$/.exec(url);
  return m ? m[1] : null;
}

/** Endereço absoluto (para prévia no WhatsApp/Instagram, que não entende "/img/..."). */
export function absoluteImageUrl(url: string | null | undefined, origin: string) {
  if (!url) return undefined;
  return url.startsWith("/") && !url.startsWith("//") ? `${origin}${url}` : url;
}
