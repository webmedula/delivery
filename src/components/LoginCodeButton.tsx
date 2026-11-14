"use client";

import { useState, useTransition } from "react";
import { createCustomerLoginCode } from "@/app/painel/actions";

/** Gera um código de acesso e mostra o link para enviar ao cliente pelo WhatsApp. */
export function LoginCodeButton({ customerId, phone, firstName, storeName, accountUrl }: {
  customerId: string; phone: string; firstName: string; storeName: string; accountUrl: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (code) {
    const text = `Olá, ${firstName}! Seu código para entrar na sua conta da ${storeName} é ${code}. Ele vale por 30 minutos e uma vez só.\nEntre aqui: ${accountUrl}`;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm">
        <span>Código: <strong className="font-mono text-base tracking-widest">{code}</strong> (30 min)</span>
        <a href={`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener" className="btn px-3 py-1.5">Enviar no WhatsApp</a>
      </div>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className="btn-ghost"
        disabled={pending}
        title="Para o cliente entrar em Minha conta em outro celular, sem PIN"
        onClick={() => start(async () => {
          const r = await createCustomerLoginCode(customerId);
          if ("code" in r) setCode(r.code); else setError(r.error);
        })}
      >
        {pending ? "Gerando..." : "Código de acesso"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
