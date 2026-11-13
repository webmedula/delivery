"use client";

import { useActionState } from "react";
import type { AdminState } from "@/app/admin/actions";

type Action = (state: AdminState, formData: FormData) => Promise<AdminState>;

/** Formulário de ação do administrador: mostra o erro ou a confirmação logo abaixo. */
export function AdminActionForm({
  action, hidden, children, confirmText, className,
}: {
  action: Action;
  hidden: Record<string, string>;
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => { if (confirmText && !confirm(confirmText)) e.preventDefault(); }}
    >
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <fieldset disabled={pending} className="flex flex-wrap items-end gap-2">{children}</fieldset>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="mt-2 break-all text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}
