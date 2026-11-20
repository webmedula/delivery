import type { Metadata } from "next";
import { db } from "@/lib/db";
import { calendarEnabled, readInviteToken } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Google Agenda", robots: { index: false, follow: false } };

// Página do link que a barbearia manda ao profissional: ele conecta a própria conta Google
// e os horários dele passam a aparecer no Google Agenda do celular.

const RESULTS: Record<string, { title: string; text: string; ok?: boolean }> = {
  ok: {
    ok: true,
    title: "Pronto, Google Agenda conectado ✓",
    text: "Seus horários vão aparecer no Google Agenda, numa agenda nova com o nome da barbearia e \"WebTenda\". Agendamentos novos, cancelamentos e faltas entram sozinhos, na hora. Pode fechar esta página.",
  },
  cancelado: { title: "Conexão cancelada", text: "Nada foi alterado. Se quiser conectar, abra de novo o link que a barbearia mandou." },
  "sem-permissao": {
    title: "Falta marcar a permissão da agenda",
    text: "Na tela do Google, deixe marcada a opção de criar agendas e eventos. Sem ela o WebTenda não consegue colocar seus horários. Abra o link de novo e tente outra vez.",
  },
  "link-vencido": { title: "Este link venceu", text: "Peça para a barbearia mandar um link novo (ele vale 7 dias)." },
  indisponivel: { title: "Indisponível no momento", text: "A conexão com o Google Agenda não está ligada agora. Fale com a barbearia." },
  erro: { title: "Não deu certo", text: "O Google não confirmou a conexão. Abra o link de novo e tente outra vez." },
};

export default async function GoogleAgendaInvite({ searchParams }: { searchParams: Promise<{ t?: string; resultado?: string }> }) {
  const { t, resultado } = await searchParams;
  const result = resultado ? RESULTS[resultado] ?? RESULTS.erro : null;
  if (result) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <p className="text-4xl">{result.ok ? "📅" : "⚠️"}</p>
        <h1 className="text-xl font-semibold">{result.title}</h1>
        <p className="text-stone-600">{result.text}</p>
      </main>
    );
  }

  const invite = calendarEnabled() ? await readInviteToken(t ?? null) : null;
  const pro = invite
    ? await db.professional.findFirst({ where: { id: invite.professionalId, storeId: invite.storeId }, include: { store: { select: { name: true } }, calendar: { select: { googleEmail: true, brokenAt: true } } } })
    : null;
  if (!pro) {
    const r = calendarEnabled() ? RESULTS["link-vencido"] : RESULTS.indisponivel;
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{r.title}</h1>
        <p className="text-stone-600">{r.text}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-12">
      <p className="text-center text-4xl">📅</p>
      <h1 className="text-center text-xl font-semibold">Seus horários de {pro.store.name} no Google Agenda</h1>
      <p className="text-stone-600">
        Olá, {pro.name.split(" ")[0]}! Conectando sua conta Google, cada cliente que marcar com você aparece sozinho no Google Agenda do
        seu celular. Se o cliente cancelar ou faltar, o horário sai da agenda.
      </p>
      <ul className="card space-y-1 text-sm text-stone-700">
        <li>✓ O WebTenda cria uma agenda separada, com o nome da barbearia.</li>
        <li>✓ Só mexe nessa agenda: não vê nem altera seus outros compromissos.</li>
        <li>✓ Dá para desligar quando quiser, pela barbearia ou na sua conta Google.</li>
      </ul>
      {pro.calendar && !pro.calendar.brokenAt && (
        <p className="text-center text-sm text-green-700">Já conectado com {pro.calendar.googleEmail}. Conectar de novo troca a conta.</p>
      )}
      <a href={`/api/google-agenda/conectar?t=${encodeURIComponent(t!)}`} className="btn w-full py-3">Conectar com o Google</a>
      <p className="text-center text-xs text-stone-500">
        O Google pode mostrar um aviso de app em verificação. Toque em &quot;Avançado&quot; e depois em continuar.
      </p>
    </main>
  );
}
