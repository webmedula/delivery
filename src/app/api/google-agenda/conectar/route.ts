import { redirect } from "next/navigation";
import { getSessionUser, requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEnabled, readInviteToken, startCalendarConnect } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

// Começa a conexão com o Google Agenda.
// - Do painel: ?alvo=loja (agenda da barbearia) ou ?alvo=<id do profissional>.
// - Pelo link que a loja mandou ao profissional: ?t=<convite assinado> (não precisa de login).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const invite = url.searchParams.get("t");
  if (invite) {
    if (!calendarEnabled()) redirect("/google-agenda?resultado=indisponivel");
    const target = await readInviteToken(invite);
    if (!target) redirect("/google-agenda?resultado=link-vencido");
    const pro = await db.professional.findFirst({ where: { id: target.professionalId, storeId: target.storeId }, select: { id: true } });
    if (!pro) redirect("/google-agenda?resultado=link-vencido");
    redirect(await startCalendarConnect({ ...target, via: "invite" }));
  }

  if (!(await getSessionUser())) redirect("/entrar");
  const { storeId, store } = await requireStoreUser();
  if (!calendarEnabled() || store.isDemo) redirect("/painel/profissionais");
  const alvo = url.searchParams.get("alvo") ?? "loja";
  let professionalId: string | null = null;
  if (alvo !== "loja") {
    const pro = await db.professional.findFirst({ where: { id: alvo, storeId }, select: { id: true } });
    if (!pro) redirect("/painel/profissionais");
    professionalId = pro.id;
  }
  redirect(await startCalendarConnect({ storeId, professionalId, via: "panel" }));
}
