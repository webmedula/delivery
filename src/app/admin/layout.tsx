import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/(auth)/actions";

export const metadata = { title: "Administração · WebTenda" };

const nav = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/lojas", label: "Lojas" },
  { href: "/admin/usuarios", label: "Usuários" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-stone-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="flex items-center gap-2 font-bold"><Logo className="h-7 w-auto text-white" /><span className="text-stone-400">·</span> Administração</span>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-stone-200 hover:bg-stone-700">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-stone-400">{admin.email}</span>
            {admin.storeId && <Link href="/painel" className="underline">Minha loja</Link>}
            <form action={logout}><button className="underline">Sair</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
