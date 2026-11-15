// Recria as lojas demo toda madrugada, para elas voltarem ao estado original
// mesmo que visitantes mexam no painel (o login demo fica público no site).
//
// Roda dentro do próprio app (sem cron no servidor). Só recria se já existirem
// lojas demo. DEMO_AUTO_RESET=0 desliga; DEMO_RESET_HOUR muda a hora (padrão 4).
// Com mais de uma instância do app, o registro no AdminLog evita recriar duas vezes no dia.

import { db } from "@/lib/db";
import { demoResetDue } from "@/lib/demo-schedule";
import { setupDemoStores } from "../prisma/demo";

const CHECK_EVERY_MS = 10 * 60 * 1000;
const ACTION = "demo_reset_auto";

async function tick() {
  if (!(await db.store.count({ where: { isDemo: true } }))) return;
  const hour = Number(process.env.DEMO_RESET_HOUR ?? 4);
  const last = await db.adminLog.findFirst({ where: { action: ACTION }, orderBy: { createdAt: "desc" } });
  if (!demoResetDue(new Date(), last?.createdAt ?? null, Number.isFinite(hour) ? hour : 4)) return;
  // Marca antes de recriar: outra instância que olhar agora já vê que está feito.
  await db.adminLog.create({ data: { adminEmail: "sistema", action: ACTION } });
  const result = await setupDemoStores(db, { reset: true });
  console.info(`[demo] lojas demo recriadas: ${result.map((r) => r.slug).join(", ")}`);
}

export function startDemoResetJob() {
  if (process.env.DEMO_AUTO_RESET === "0" || process.env.DEMO_AUTO_RESET === "false") return;
  const run = () => tick().catch((e) => console.error("[demo] recriação automática falhou:", e instanceof Error ? e.message : e));
  setTimeout(run, 60_000); // dá tempo do app subir
  setInterval(run, CHECK_EVERY_MS).unref();
}
