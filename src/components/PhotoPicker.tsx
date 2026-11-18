"use client";

import { useRef, useState } from "react";

/**
 * Escolher fotos do celular ou do computador. A foto é reduzida no próprio aparelho
 * (sobe rápido mesmo no 4G) e o servidor converte para WebP. Também aceita colar um link.
 * A primeira foto é a principal.
 */
export function PhotoPicker({
  value,
  onChange,
  max = 1,
  kind = "product",
  shape = "portrait",
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  kind?: "product" | "logo";
  shape?: "portrait" | "square";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  // Guarda a lista atual: os envios terminam fora de ordem e cada um acrescenta a sua foto.
  const current = useRef(value);
  current.current = value;

  const room = max - value.length - uploading;
  const aspect = shape === "square" ? "aspect-square" : "aspect-[3/4]";

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const list = [...files].slice(0, Math.max(0, room));
    if (files.length > list.length) setError(max === 1 ? "Só cabe uma foto." : `Cabem até ${max} fotos por produto.`);
    setUploading((n) => n + list.length);
    await Promise.all(
      list.map(async (file) => {
        try {
          const body = new FormData();
          body.append("file", await shrink(file, kind === "logo" ? 1024 : 2000));
          body.append("kind", kind);
          const res = await fetch("/painel/imagens", { method: "POST", body });
          const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
          if (!res.ok || !data.url) throw new Error(data.error || "Não foi possível enviar a foto.");
          const next = max === 1 ? [data.url] : [...current.current, data.url].slice(0, max);
          current.current = next;
          onChange(next);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
    if (input.current) input.current.value = "";
  }

  function addLink() {
    const url = link.trim();
    if (!/^https?:\/\/\S+$/.test(url)) return setError("Cole um link que comece com https://");
    setError("");
    onChange(max === 1 ? [url] : [...value, url].slice(0, max));
    setLink("");
    setLinkOpen(false);
  }

  const move = (i: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${max === 1 ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-5"}`}>
        {value.map((url, i) => (
          <div key={url + i} className={`group relative overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200 ${aspect}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            {max > 1 && i === 0 && (
              <span className="absolute left-1.5 top-1.5 rounded-md bg-stone-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">Principal</span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5">
              {max > 1 ? (
                <span className="flex gap-1">
                  {i > 0 && <IconBtn label="Mover para a esquerda" onClick={() => move(i, i - 1)}>←</IconBtn>}
                  {i < value.length - 1 && <IconBtn label="Mover para a direita" onClick={() => move(i, i + 1)}>→</IconBtn>}
                  {i > 0 && <IconBtn label="Usar como principal" onClick={() => move(i, 0)}>★</IconBtn>}
                </span>
              ) : <span />}
              <IconBtn label="Tirar foto" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</IconBtn>
            </div>
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up${i}`} className={`grid place-items-center rounded-xl bg-stone-100 ring-1 ring-stone-200 ${aspect}`}>
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" aria-label="Enviando" />
          </div>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 bg-white p-2 text-center text-xs font-medium text-stone-600 hover:border-stone-400 hover:bg-stone-50 ${aspect}`}
          >
            <span className="text-2xl leading-none">＋</span>
            {value.length === 0 ? (kind === "logo" ? "Enviar logo" : max > 1 ? "Adicionar fotos" : "Adicionar foto") : "Mais fotos"}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple={max > 1} className="hidden" onChange={(e) => onFiles(e.target.files)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {linkOpen ? (
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="https://..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
            autoFocus
          />
          <button type="button" className="btn-ghost" onClick={addLink}>Usar link</button>
        </div>
      ) : (
        room > 0 && (
          <button type="button" className="text-xs text-stone-500 underline underline-offset-2" onClick={() => setLinkOpen(true)}>
            Prefere colar o link de uma foto?
          </button>
        )
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-xs font-bold text-stone-800 shadow hover:bg-white"
    >
      {children}
    </button>
  );
}

/** Reduz a foto no aparelho antes de enviar. Se o navegador não conseguir ler (ex.: HEIC no Android), envia como está. */
async function shrink(file: File, maxSide: number): Promise<Blob> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bitmap.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, file.type === "image/png" ? "image/png" : "image/jpeg", 0.88));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
