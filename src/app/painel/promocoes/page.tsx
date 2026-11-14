import { requireStoreUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { describeDiscount } from "@/lib/discounts";
import { deleteCoupon, toggleCoupon } from "../actions";
import { CouponForm, LoyaltyForm } from "@/components/PromoForms";

export const dynamic = "force-dynamic";

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export default async function PromotionsPage() {
  const { store, storeId } = await requireStoreUser();
  const [coupons, uses, rewards] = await Promise.all([
    db.coupon.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } }),
    db.order.groupBy({ by: ["couponId"], where: { storeId, couponId: { not: null }, status: { not: "CANCELED" } }, _count: true, _sum: { discountCents: true } }),
    db.order.aggregate({ where: { storeId, loyaltyReward: true, status: { not: "CANCELED" } }, _count: true, _sum: { discountCents: true } }),
  ]);
  const usesById = new Map(uses.map((u) => [u.couponId, u]));
  const now = new Date();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Cupons e fidelidade</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <LoyaltyForm
            enabled={store.loyaltyEnabled}
            ordersRequired={store.loyaltyOrdersRequired}
            type={store.loyaltyRewardType}
            value={store.loyaltyRewardType === "PERCENT" ? String(store.loyaltyRewardValue) : centsToInput(store.loyaltyRewardValue)}
            minOrder={centsToInput(store.loyaltyMinOrderCents)}
          />
          {rewards._count > 0 && (
            <p className="text-sm text-stone-600">
              Recompensas já usadas: <strong>{rewards._count}</strong> ({formatBRL(rewards._sum.discountCents ?? 0)} em descontos).
            </p>
          )}
          <CouponForm />
        </div>

        <div className="card space-y-3 self-start">
          <h2 className="font-semibold">Seus cupons</h2>
          {coupons.length === 0 && <p className="text-sm text-stone-500">Nenhum cupom ainda. Divulgue o código no Instagram ou no WhatsApp e o cliente digita na sacola.</p>}
          <ul className="divide-y divide-stone-100">
            {coupons.map((c) => {
              const u = usesById.get(c.id);
              const expired = c.expiresAt && c.expiresAt < now;
              const soldOut = c.maxUses > 0 && (u?._count ?? 0) >= c.maxUses;
              const status = !c.active ? "Pausado" : expired ? "Expirado" : soldOut ? "Esgotado" : "Ativo";
              const rules = [
                c.minOrderCents > 0 && `mínimo ${formatBRL(c.minOrderCents)}`,
                c.maxUses > 0 && `até ${c.maxUses} usos`,
                c.oncePerCustomer && "1 por cliente",
                c.firstOrderOnly && "só 1º pedido",
                c.expiresAt && `até ${c.expiresAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
              ].filter(Boolean);
              return (
                <li key={c.id} className="space-y-1 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{c.code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status === "Ativo" ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-600"}`}>{status}</span>
                  </div>
                  <p className="text-sm">{describeDiscount(c)}{rules.length ? <span className="text-stone-500"> · {rules.join(" · ")}</span> : null}</p>
                  <p className="text-xs text-stone-500">Usado {u?._count ?? 0} vez(es) · {formatBRL(u?._sum.discountCents ?? 0)} em descontos</p>
                  <div className="flex gap-3 text-sm">
                    <form action={toggleCoupon}><input type="hidden" name="id" value={c.id} /><button className="text-brand-700 hover:underline">{c.active ? "Pausar" : "Reativar"}</button></form>
                    <form action={deleteCoupon}><input type="hidden" name="id" value={c.id} /><button className="text-red-600 hover:underline">Excluir</button></form>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
