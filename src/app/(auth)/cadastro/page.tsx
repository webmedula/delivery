import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { TRIAL_DAYS } from "@/lib/subscription";
import { NICHES, UPCOMING_NICHES, nicheFromParam } from "@/lib/niche";
import { signup } from "../actions";
import { TABLE_SIGNUP } from "@/lib/tables";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  // As páginas de venda (delivery.webtenda.com.br, loja.webtenda.com.br) mandam ?tipo= já escolhido.
  const tipo = (await searchParams).tipo;
  const chosen: string = tipo === TABLE_SIGNUP.param ? TABLE_SIGNUP.value : (nicheFromParam(tipo) ?? "FOOD");
  // Restaurante com mesas aparece logo depois do delivery.
  const options = NICHES.flatMap((n) => (n.value === "FOOD" ? [n, TABLE_SIGNUP] : [n]));
  return (
    <>
      <h1 className="text-lg font-semibold">Crie sua loja</h1>
      <p className="mb-4 text-sm text-stone-600">{TRIAL_DAYS} dias grátis, sem cartão.</p>
      <AuthForm
        action={signup}
        submitLabel="Criar minha loja"
        fields={[
          { name: "storeName", label: "Nome da loja" },
          { name: "name", label: "Seu nome", autoComplete: "name" },
          { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
          { name: "password", label: "Senha (mín. 8 caracteres)", type: "password", autoComplete: "new-password" },
        ]}
      >
        <fieldset className="space-y-2">
          <legend className="label">Que tipo de negócio você tem?</legend>
          {options.map((n) => (
            <label
              key={n.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 text-sm transition has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:ring-1 has-[:checked]:ring-brand-500"
            >
              <input type="radio" name="businessType" value={n.value} defaultChecked={n.value === chosen} className="mt-1 accent-brand-600" />
              <span>
                <strong className="block text-stone-900">{n.title}</strong>
                <span className="text-stone-500">{n.examples}</span>
              </span>
            </label>
          ))}
          <p className="px-1 text-xs text-stone-500">
            Em breve: {UPCOMING_NICHES.map((n) => `${n.title.toLowerCase()} (${n.examples.toLowerCase()})`).join(" e ")}.
          </p>
        </fieldset>
      </AuthForm>
      <p className="mt-4 text-center text-sm text-stone-600">
        Já tem conta? <Link href="/entrar" className="font-medium text-brand-700">Entrar</Link>
      </p>
    </>
  );
}
