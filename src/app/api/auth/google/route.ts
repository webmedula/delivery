import { redirect } from "next/navigation";
import { googleEnabled, startGoogleLogin } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

// Botão "Entrar com Google": manda o lojista para a tela de escolha de conta do Google.
export async function GET(request: Request) {
  if (!googleEnabled()) redirect("/entrar");
  const { searchParams } = new URL(request.url);
  redirect(await startGoogleLogin(searchParams.get("tipo"), searchParams.get("parceiro")));
}
