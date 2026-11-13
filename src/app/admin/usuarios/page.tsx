import Link from "next/link";
import { db } from "@/lib/db";
import { isAdminEmail, requireAdmin } from "@/lib/auth";
import { AdminActionForm } from "@/components/AdminForms";
import { resetPassword } from "../actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const term = q.trim();
  const users = await db.user.findMany({
    where: term
      ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] }
      : undefined,
    include: { store: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Usuários <span className="text-base font-normal text-stone-500">({users.length})</span></h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" className="input max-w-xs" />
        <button className="btn">Buscar</button>
        {q && <Link href="/admin/usuarios" className="btn-ghost">Limpar</Link>}
      </form>
      <div className="card p-0">
        <ul className="divide-y divide-stone-100 text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-[220px] flex-1">
                <p className="font-medium">
                  {u.name}
                  {isAdminEmail(u.email) && <span className="ml-2 rounded-full bg-stone-900 px-2 py-0.5 text-xs text-white">Administrador</span>}
                </p>
                <p className="text-stone-500">{u.email}</p>
              </div>
              <div className="w-48">
                {u.store ? <Link href={`/admin/lojas/${u.store.id}`} className="text-brand-700 hover:underline">{u.store.name}</Link> : <span className="text-stone-400">Sem loja</span>}
              </div>
              <span className="w-24 text-stone-500">{dateFmt.format(u.createdAt)}</span>
              <AdminActionForm action={resetPassword} hidden={{ userId: u.id }} confirmText={`Gerar uma senha nova para ${u.email}? A senha atual deixa de funcionar.`}>
                <button className="btn-ghost">Redefinir senha</button>
              </AdminActionForm>
            </li>
          ))}
          {users.length === 0 && <li className="px-4 py-8 text-center text-stone-500">Nenhum usuário encontrado.</li>}
        </ul>
      </div>
    </div>
  );
}
