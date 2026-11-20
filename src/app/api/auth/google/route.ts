import { redirect } from "next/navigation";
import { googleEnabled, startGoogleLogin } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

// Botão "Entrar com Google": manda o lojista para a tela de escolha de conta do Google.
export async function GET(request: Request) {
  if (!googleEnabled()) redirect("/entrar");
  const tipo = new URL(request.url).searchParams.get("tipo");
  redirect(await startGoogleLogin(tipo));
}
