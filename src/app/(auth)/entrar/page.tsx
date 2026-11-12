import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { login } from "../actions";

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Entrar no painel</h1>
      <AuthForm
        action={login}
        submitLabel="Entrar"
        fields={[
          { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
          { name: "password", label: "Senha", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-4 text-center text-sm text-stone-600">
        Ainda não tem loja? <Link href="/cadastro" className="font-medium text-brand-700">Criar grátis</Link>
      </p>
    </>
  );
}
