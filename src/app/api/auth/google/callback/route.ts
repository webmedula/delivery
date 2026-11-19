import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { checkGoogleState, fetchGoogleProfile, googleEnabled, savePendingGoogleSignup } from "@/lib/google-auth";
import { calendarEnabled, finishCalendarConnect, isCalendarState } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

// O Google volta para cá depois que o lojista escolhe a conta.
// 1) Conta já vinculada ao Google: entra.
// 2) Já existe conta com o mesmo e-mail (feita com senha): vincula o Google e entra. A senha continua valendo.
// 3) E-mail novo: pede só o nome da loja e o tipo de negócio em /cadastro/google.
export async function GET(request: Request) {
  if (!googleEnabled()) redirect("/entrar");
  const url = new URL(request.url);
  // Mesmo endereço de retorno serve para conectar o Google Agenda (o "state" diz qual é qual).
  if (isCalendarState(url.searchParams.get("state"))) {
    redirect(calendarEnabled() ? await finishCalendarConnect(url) : "/painel");
  }
  const { ok, tipo } = await checkGoogleState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  // Cancelou na tela do Google, ou o link expirou: volta sem alarde.
  if (url.searchParams.get("error") === "access_denied") redirect("/entrar");
  if (!ok || !code) redirect("/entrar?erro=google");

  const profile = await fetchGoogleProfile(code);
  if (!profile) redirect("/entrar?erro=google");

  const user =
    (await db.user.findUnique({ where: { googleId: profile.googleId } })) ??
    (await db.user.findUnique({ where: { email: profile.email } }));

  if (user) {
    if (user.googleId !== profile.googleId) {
      if (user.googleId) redirect("/entrar?erro=google-outra-conta");
      await db.user.update({ where: { id: user.id }, data: { googleId: profile.googleId } });
    }
    await createSession(user.id);
    redirect("/painel");
  }

  await savePendingGoogleSignup(profile, tipo);
  redirect("/cadastro/google");
}
