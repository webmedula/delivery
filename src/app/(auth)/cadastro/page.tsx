import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { TRIAL_DAYS } from "@/lib/subscription";
import { signup } from "../actions";

export default function SignupPage() {
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
      />
      <p className="mt-4 text-center text-sm text-stone-600">
        Já tem conta? <Link href="/entrar" className="font-medium text-brand-700">Entrar</Link>
      </p>
    </>
  );
}
