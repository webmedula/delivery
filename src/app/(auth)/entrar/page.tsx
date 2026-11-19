import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { GoogleButton } from "@/components/GoogleButton";
import { login } from "../actions";

const ERRORS: Record<string, string> = {
  google: "Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.",
  "google-outra-conta": "Este e-mail já está ligado a outra conta Google. Entre com a conta Google de antes ou com e-mail e senha.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const erro = (await searchParams).erro;
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Entrar no painel</h1>
      {erro && ERRORS[erro] && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERRORS[erro]}</p>}
      <GoogleButton />
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
