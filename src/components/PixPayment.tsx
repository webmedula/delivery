"use client";

import { useState } from "react";

/** QR Code do Pix + botão de copiar o código "copia e cola". */
export function PixPayment({ image, payload }: { image: string; payload: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {}
  }
  return (
    <div className="space-y-3 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${image}`} alt="QR Code do Pix" className="mx-auto h-56 w-56" />
      <p className="text-sm text-stone-600">Abra o app do seu banco e escaneie o QR Code, ou copie o código abaixo.</p>
      <textarea readOnly value={payload} rows={3} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={copy} className="btn w-full py-3">{copied ? "Código copiado!" : "Copiar código Pix"}</button>
    </div>
  );
}
