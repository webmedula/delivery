// Quando recriar as lojas demo sozinho. Função pura para poder testar.

const BRT_OFFSET_HOURS = -3; // America/Sao_Paulo (sem horário de verão desde 2019)

/** Data (AAAA-MM-DD) e hora no horário de Brasília. */
export function brasiliaClock(now: Date) {
  const local = new Date(now.getTime() + BRT_OFFSET_HOURS * 60 * 60 * 1000);
  return { day: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

/**
 * Está na hora de recriar? Só a partir da hora marcada (padrão 4h da manhã) e uma vez por dia:
 * lastResetAt é a última recriação automática (ou null se nunca houve).
 */
export function demoResetDue(now: Date, lastResetAt: Date | null, hour = 4): boolean {
  const today = brasiliaClock(now);
  if (today.hour < hour) return false;
  if (!lastResetAt) return true;
  return brasiliaClock(lastResetAt).day !== today.day;
}
