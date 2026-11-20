import { db } from "@/lib/db";
import { inviteUrl } from "@/lib/google-calendar";
import { whatsappLink } from "@/lib/phone";
import { disconnectGoogleCalendar } from "@/app/painel/profissionais/actions";

// Painel > Profissionais: conectar o Google Agenda da barbearia e de cada profissional.

const NOTICES: Record<string, { text: string; ok?: boolean }> = {
  ok: { ok: true, text: "Google Agenda conectado ✓ Os próximos horários já estão indo para lá." },
  cancelado: { text: "Conexão cancelada na tela do Google. Nada mudou." },
  "sem-permissao": { text: "Na tela do Google, deixe marcada a permissão de criar agendas e eventos, senão o WebTenda não consegue colocar os horários." },
  erro: { text: "O Google não confirmou a conexão. Tente de novo." },
};

type Conn = { id: string; googleEmail: string; brokenAt: Date | null; lastError: string | null };

function Status({ conn }: { conn: Conn }) {
  if (conn.brokenAt) return <span className="text-red-700">Desconectado pelo Google ({conn.googleEmail}). Conecte de novo.</span>;
  return (
    <span className="text-green-700">
      Conectado: {conn.googleEmail}
      {conn.lastError && <span className="block text-amber-700">{conn.lastError}</span>}
    </span>
  );
}

function Disconnect({ id }: { id: string }) {
  return (
    <form action={disconnectGoogleCalendar}>
      <input type="hidden" name="id" value={id} />
      <button className="text-stone-500 hover:underline">Desconectar</button>
    </form>
  );
}

export async function GoogleAgendaPanel({ storeId, storeName, notice }: { storeId: string; storeName: string; notice?: string }) {
  const [connections, pros] = await Promise.all([
    db.calendarConnection.findMany({ where: { storeId } }),
    db.professional.findMany({ where: { storeId, active: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, phone: true } }),
  ]);
  const shop = connections.find((c) => c.professionalId === null);
  const rows = await Promise.all(
    pros.map(async (p) => {
      const link = await inviteUrl(storeId, p.id);
      const message = `Oi, ${p.name.split(" ")[0]}! Conecte seu Google Agenda para os seus horários de ${storeName} aparecerem sozinhos no celular: ${link}`;
      return { ...p, conn: connections.find((c) => c.professionalId === p.id), link, whatsapp: p.phone ? whatsappLink(p.phone, message) : null };
    }),
  );
  const n = notice ? NOTICES[notice] ?? NOTICES.erro : null;

  return (
    <section id="google-agenda" className="card space-y-3">
      <div>
        <h2 className="font-semibold">Google Agenda</h2>
        <p className="text-sm text-stone-500">
          Cada agendamento aparece sozinho no Google Agenda, na hora. Se o horário for cancelado ou o cliente faltar, sai de lá também. O WebTenda cria uma
          agenda separada na conta Google e só mexe nela.
        </p>
      </div>
      {n && <p className={`rounded-lg px-3 py-2 text-sm ${n.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>{n.text}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 p-3 text-sm">
        <div className="min-w-0">
          <p className="font-medium text-stone-900">Agenda da barbearia (todos os horários)</p>
          {shop ? <Status conn={shop} /> : <span className="text-stone-500">Para quem atende o telefone ou cuida da agenda de todos.</span>}
        </div>
        <div className="flex flex-none items-center gap-3">
          {shop && <Disconnect id={shop.id} />}
          {(!shop || shop.brokenAt) && <a href="/api/google-agenda/conectar?alvo=loja" className="btn-ghost">Conectar</a>}
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-stone-100 text-sm">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="font-medium text-stone-900">{p.name} (só os próprios horários)</p>
                {p.conn ? <Status conn={p.conn} /> : <span className="text-stone-500">Não conectado</span>}
              </div>
              <div className="flex flex-none flex-wrap items-center gap-3">
                {p.conn && <Disconnect id={p.conn.id} />}
                {(!p.conn || p.conn.brokenAt) && (
                  <>
                    {p.whatsapp ? (
                      <a href={p.whatsapp} target="_blank" rel="noopener" className="btn-ghost">Mandar link pelo WhatsApp</a>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-brand-700">Copiar link</summary>
                        <input readOnly value={p.link} className="input mt-1 w-64 text-xs" />
                      </details>
                    )}
                    <a href={`/api/google-agenda/conectar?alvo=${p.id}`} className="text-brand-700 hover:underline">Conectar neste aparelho</a>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-stone-500">
        O link vale 7 dias. Cada profissional entra com a própria conta Google no celular dele. As mudanças são feitas aqui no WebTenda: o que for mexido
        direto no Google Agenda não volta para cá.
      </p>
    </section>
  );
}
