"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Formulários com <form action={...}> são limpos pelo React depois de cada envio,
 * inclusive quando dá erro. Este onSubmit envia sem limpar, para o usuário
 * corrigir só o campo errado.
 */
export function keepOnSubmit(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}
