/** Aviso no lugar das telas que ficam desligadas nas lojas de demonstração. */
export function DemoNotice({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="card text-sm text-stone-700">
        <p className="mb-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Loja de demonstração</p>
        <p>{text}</p>
      </div>
    </div>
  );
}
