import "server-only";
import QRCode from "qrcode";

/** QR code em SVG (texto), para pôr direto na página. Margem pequena: o cartão impresso já tem borda branca. */
export function qrSvg(text: string, opts: { margin?: number } = {}) {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: opts.margin ?? 1, color: { dark: "#1c1917", light: "#ffffff" } });
}
