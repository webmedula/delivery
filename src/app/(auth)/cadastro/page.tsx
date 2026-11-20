import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { TRIAL_DAYS } from "@/lib/subscription";
import { nicheFromParam } from "@/lib/niche";
import { BusinessTypeOptions } from "@/components/BusinessTypeOptions";
import { GoogleButton } from "@/components/GoogleButton";
import { signup } from "../actions";
import { TABLE_SIGNUP } from "@/lib/tables";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  // As páginas de venda (delivery.webtenda.com.br, loja.webtenda.com.br) mandam ?tipo= já escolhido.
  const tipo = (await searchParams).tipo;
  const chosen: string = tipo === TABLE_SIGNUP.param ? TABLE_SIGNUP.value : (nicheFromParam(tipo) ?? "FOOD");
  return (
    <>
      <h1 className="text-lg font-semibold">Crie sua loja</h1>
      <p className="mb-4 text-sm text-stone-600">{TRIAL_DAYS} dias grátis, sem cartão.</p>
      <GoogleButton tipo={tipo} label="Criar com Google" />
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
        <BusinessTypeOptions chosen={chosen} />
      </AuthForm>
      <p className="mt-4 text-center text-sm text-stone-600">
        Já tem conta? <Link href="/entrar" className="font-medium text-brand-700">Entrar</Link>
      </p>
    </>
  );
}
