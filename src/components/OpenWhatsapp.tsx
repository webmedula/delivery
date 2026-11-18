"use client";

import { useEffect } from "react";

/** Abre a conversa com a loja logo depois do pedido (modo "fechar pelo WhatsApp"), uma vez só. */
export function OpenWhatsapp({ url }: { url: string }) {
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
    window.location.href = url;
  }, [url]);
  return null;
}
