import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { BusinessTypeOptions } from "@/components/BusinessTypeOptions";
import { readPendingGoogleSignup } from "@/lib/google-auth";
import { nicheFromParam } from "@/lib/niche";
import { TABLE_SIGNUP } from "@/lib/tables";
import { TRIAL_DAYS } from "@/lib/subscription";
import { completeGoogleSignup } from "../../actions";
import { PartnerCodeField } from "@/components/PartnerCodeField";

// Conta Google nova: falta só o nome da loja e o tipo de negócio.
export default async function GoogleSignupPage() {
  const pending = await readPendingGoogleSignup();
  if (!pending) redirect("/cadastro");
  const chosen: string = pending.tipo === TABLE_SIGNUP.param ? TABLE_SIGNUP.value : (nicheFromParam(pending.tipo) ?? "FOOD");
  return (
    <>
      <h1 className="text-lg font-semibold">Falta pouco para criar sua loja</h1>
      <p className="mb-4 text-sm text-stone-600">
        Você vai entrar com o Google como <strong className="text-stone-800">{pending.email}</strong>. {TRIAL_DAYS} dias grátis, sem cartão.
      </p>
      <AuthForm
        action={completeGoogleSignup}
        submitLabel="Criar minha loja"
        fields={[
          { name: "storeName", label: "Nome da loja" },
          { name: "name", label: "Seu nome", autoComplete: "name", defaultValue: pending.name },
        ]}
        after={<PartnerCodeField code={pending.parceiro} />}
      >
        <BusinessTypeOptions chosen={chosen} />
      </AuthForm>
    </>
  );
}
