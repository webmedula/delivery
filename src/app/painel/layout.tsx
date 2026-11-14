import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { isAdminEmail, requireStoreUser } from "@/lib/auth";
import { leaveSupport } from "@/app/admin/actions";
import { canTakeOrders, trialDaysLeft } from "@/lib/subscription";
import { logout } from "@/app/(auth)/actions";

const nav = [
  { href: "/painel", label: "Pedidos" },
  { href: "/painel/cardapio", label: "Cardápio" },
  { href: "/painel/clientes", label: "Clientes" },
  { href: "/painel/promocoes", label: "Cupons" },
  { href: "/painel/campanhas", label: "Promoções" },
  { href: "/painel/loja", label: "Minha loja" },
  { href: "/painel/pagamentos", label: "Pagamentos" },
  { href: "/painel/assinatura", label: "Assinatura" },
];

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { store, user, support } = await requireStoreUser();
  const active = canTakeOrders(store);
  const days = trialDaysLeft(store);

  return (
    <div className="min-h-screen">
      {support && (
        <form action={leaveSupport} className="bg-stone-900 px-4 py-2 text-center text-sm text-white">
          Modo suporte: você está vendo o painel de <strong>{store.name}</strong> como administrador.{" "}
          <button className="underline">Sair do modo suporte</button>
        </form>
      )}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="flex items-center gap-2 font-bold text-brand-700"><LogoMark className="h-7 w-7" />{store.name}</span>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 text-stone-700 hover:bg-stone-100">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!support && isAdminEmail(user.email) && <Link href="/admin" className="btn-ghost">Administração</Link>}
            <a href={`/loja/${store.slug}`} target="_blank" className="btn-ghost">Ver cardápio</a>
            <form action={logout}><button className="btn-ghost">Sair</button></form>
          </div>
        </div>
      </header>
      {store.isDemo && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Loja de demonstração: os dados são fictícios e voltam ao original quando a administração recria as lojas demo.
        </div>
      )}
      {store.blockedAt ? (
        <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
          Sua loja foi bloqueada pela administração da WebTenda{store.blockedReason ? `: ${store.blockedReason}` : "."} Fale com o suporte.
        </div>
      ) : !active ? (
        <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
          Sua loja está bloqueada para novos pedidos. <Link href="/painel/assinatura" className="underline">Regularize a assinatura</Link>.
        </div>
      ) : days > 0 ? (
        <div className="bg-brand-50 px-4 py-2 text-center text-sm text-brand-700">
          Faltam {days} dia(s) do seu período de teste.
        </div>
      ) : null}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
