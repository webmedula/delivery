import { requireStoreUser } from "@/lib/auth";
import { listCustomers } from "@/lib/customer-list";
import { toCSV } from "@/lib/csv";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const date = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export async function GET(req: Request) {
  const { store } = await requireStoreUser();
  const url = new URL(req.url);
  const onlyOptIn = url.searchParams.get("promocoes") === "1";
  const rows = await listCustomers(store, { q: url.searchParams.get("q") ?? undefined, onlyOptIn, sort: "nome" });
  const csv = toCSV([
    ["Nome", "WhatsApp", "Aceita promoções", "Pedidos", "Total gasto (R$)", "Último pedido", "Cliente desde", ...(store.loyaltyEnabled ? ["Selos"] : [])],
    ...rows.map((r) => [
      r.name,
      formatPhone(r.phone),
      r.marketingOptIn ? "Sim" : "Não",
      r.orders,
      money(r.totalCents),
      date(r.lastOrderAt),
      date(r.createdAt),
      ...(store.loyaltyEnabled ? [r.stamps ?? 0] : []),
    ]),
  ]);
  const name = `clientes-${store.slug}${onlyOptIn ? "-promocoes" : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
