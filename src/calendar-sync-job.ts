// Google Agenda: a cada 10 minutos tenta de novo os agendamentos que não chegaram lá
// (Google fora do ar, internet caiu, servidor reiniciou no meio). Não faz nada sem GOOGLE_AGENDA=1.

import { calendarEnabled, retryPendingSyncs } from "@/lib/google-calendar";

const EVERY_MS = 10 * 60 * 1000;

export function startCalendarSyncJob() {
  if (!calendarEnabled()) return;
  const run = () =>
    retryPendingSyncs()
      .then((n) => n > 0 && console.info(`[google-agenda] ${n} agendamento(s) sincronizado(s) de novo`))
      .catch((e) => console.error("[google-agenda] nova tentativa falhou:", e instanceof Error ? e.message : e));
  setTimeout(run, 90_000);
  setInterval(run, EVERY_MS).unref();
}
