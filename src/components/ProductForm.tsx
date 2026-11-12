"use client";

import { useActionState, useEffect, useRef } from "react";
import { createProduct } from "@/app/painel/actions";

export function ProductForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createProduct, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <input name="name" placeholder="Nome" className="input" required />
      <textarea name="description" placeholder="Descrição (opcional)" className="input" rows={2} />
      <input name="price" placeholder="Preço, ex.: 24,90" className="input" inputMode="decimal" required />
      <select name="categoryId" className="input" defaultValue="">
        <option value="">Sem categoria</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input name="imageUrl" placeholder="URL da foto (opcional)" className="input" />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Salvando..." : "Adicionar produto"}</button>
    </form>
  );
}
