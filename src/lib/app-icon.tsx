import "server-only";
import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";
import { ImageResponse } from "next/og";
import { HEX_COLOR } from "@/lib/theme";

// Ícone do "app" de cada loja (tela inicial do celular), feito na hora a partir do logo e da cor da loja.
// Sem logo (ou com um logo que não dá para ler), usa a inicial do nome sobre a cor da loja.

export const ICON_SIZES = [192, 512] as const;
const DEFAULT_COLOR = "#ea580c";
const MAX_BYTES = 3 * 1024 * 1024;
const FONT_FILE = path.join(process.cwd(), "node_modules/@fontsource/outfit/files/outfit-latin-700-normal.woff");
let font: Promise<Buffer | null> | null = null;
const loadFont = () => (font ??= readFile(FONT_FILE).catch(() => null));
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml" };

export function storeColor(color: string | null | undefined) {
  return color && HEX_COLOR.test(color) ? color : DEFAULT_COLOR;
}

function isPrivateAddress(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function toDataUrl(type: string, data: Buffer) {
  if (type === "image/svg+xml") {
    // SVG sem largura/altura próprias sai do tamanho errado no gerador de imagem.
    const svg = data.toString("utf8").replace(/<svg\b([^>]*)>/i, (tag, attrs: string) =>
      /\swidth=/.test(attrs) ? tag : `<svg width="512" height="512"${attrs}>`);
    data = Buffer.from(svg);
  }
  return `data:${type};base64,${data.toString("base64")}`;
}

/** Lê o logo como data URL (que o gerador de imagem entende). null = não deu para usar. */
export async function loadLogo(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    // Logo dentro do próprio sistema (ex.: /demo/logos/x.svg): lê direto da pasta public.
    if (logoUrl.startsWith("/") && !logoUrl.startsWith("//")) {
      const pub = path.join(process.cwd(), "public");
      const file = path.normalize(path.join(pub, decodeURIComponent(logoUrl.split(/[?#]/)[0])));
      const type = TYPES[path.extname(file).toLowerCase()];
      if (!file.startsWith(pub + path.sep) || !type) return null;
      const data = await readFile(file);
      return data.length > MAX_BYTES ? null : toDataUrl(type, data);
    }
    const url = new URL(logoUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // O link é digitado pelo lojista: não deixa apontar para a rede interna do servidor.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
    if (ips.length === 0 || ips.some(isPrivateAddress)) return null;
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { accept: "image/*" } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!Object.values(TYPES).includes(type)) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length > MAX_BYTES ? null : toDataUrl(type, data);
  } catch {
    return null;
  }
}

/**
 * Desenha o ícone. "maskable" deixa uma margem de segurança, porque o Android recorta o ícone
 * em círculo, gota etc.; o normal ocupa o quadrado todo.
 */
/** tab = ícone da aba do navegador: logo inteiro, sem fundo. */
export async function renderAppIcon({ size, logo, name, color, maskable, tab = false }: { size: number; logo: string | null; name: string; color: string; maskable: boolean; tab?: boolean }) {
  // Logo sobre fundo branco, com margem: o iPhone pinta de preto as partes transparentes
  // e o Android recorta as bordas; assim o logo nunca é cortado.
  const inner = Math.round(size * (tab ? 1 : maskable ? 0.66 : 0.82));
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const body = logo ? (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: tab ? "transparent" : "#ffffff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={logo} width={inner} height={inner} style={{ width: inner, height: inner, objectFit: "contain" }} />
    </div>
  ) : (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: color, color: "#ffffff", fontSize: Math.round(size * (maskable ? 0.42 : 0.56)), fontWeight: 700, fontFamily: "Outfit" }}>
      {initial}
    </div>
  );
  const data = await loadFont();
  return new ImageResponse(body, { width: size, height: size, fonts: data ? [{ name: "Outfit", data, weight: 700, style: "normal" }] : undefined });
}
