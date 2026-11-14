// npm run demo            apaga e recria as lojas demo
// npm run demo -- --remove  apaga as lojas demo
import { PrismaClient } from "@prisma/client";
import { DEFAULT_DEMO_PASSWORD, removeDemoStores, setupDemoStores } from "./demo";

const db = new PrismaClient();

async function main() {
  if (process.argv.includes("--remove")) {
    console.log(`${await removeDemoStores(db)} loja(s) demo apagada(s).`);
    return;
  }
  const result = await setupDemoStores(db, { reset: true });
  const password = process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
  console.log("Lojas demo prontas:\n");
  for (const r of result) console.log(`  ${r.name.padEnd(22)} /loja/${r.slug.padEnd(22)} painel: ${r.email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
