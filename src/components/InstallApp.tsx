"use client";

import { useEffect, useState } from "react";

// Convite para o cliente instalar o cardápio da loja como app na tela inicial do celular.
// Android (Chrome, Samsung, Edge): o navegador oferece a instalação e o botão abre a janela dele.
// iPhone/iPad: a Apple não deixa o site abrir essa janela, então mostramos o passo a passo.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const HIDE_DAYS = 30;

/** Registra o service worker do cardápio (aviso de "sem internet" no app). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/loja/" }).catch(() => {});
  }, []);
  return null;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Navegadores dentro de outros apps (Instagram, Facebook...) não conseguem instalar no iPhone. */
function isInAppBrowser() {
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|GSA\//.test(navigator.userAgent);
}

function readHidden(key: string) {
  try {
    const at = Number(localStorage.getItem(key));
    return at > 0 && Date.now() - at < HIDE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function InstallInvite({ slug, name, logoUrl, compact = false }: { slug: string; name: string; logoUrl: string | null; compact?: boolean }) {
  const key = `app-convite:${slug}`;
  const [mode, setMode] = useState<"none" | "prompt" | "ios">("none");
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [steps, setSteps] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isStandalone() || readHidden(key)) return;
    const mobile = window.matchMedia("(pointer: coarse)").matches;
    if (isIOS()) {
      if (!isInAppBrowser()) setMode("ios");
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // guarda o convite do navegador para o nosso botão
      setDeferred(e as InstallEvent);
      if (mobile) setMode("prompt");
    };
    const onInstalled = () => { setDone(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [key]);

  function hide() {
    try { localStorage.setItem(key, String(Date.now())); } catch {}
    setMode("none");
  }

  async function install() {
    if (mode === "ios") return setSteps(true);
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setDone(true);
    else hide();
  }

  if (done) {
    return (
      <div className={`${compact ? "" : "mx-3 mt-3 md:mx-6"} rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/15`}>
        Pronto! O app {name} está na tela inicial do seu celular.
      </div>
    );
  }
  if (mode === "none") return null;

  return (
    <>
      <div className={`${compact ? "" : "mx-3 mt-3 md:mx-6"} flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-stone-900/5`}>
        <AppIcon name={name} logoUrl={logoUrl} />
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <strong className="block text-[15px] text-stone-900">{compact ? "Acompanhe pelo app" : "Tenha a loja no celular"}</strong>
          <span className="text-stone-600">
            {compact ? "Instale o app da loja e peça de novo com um toque." : "Instale o app e peça com um toque, direto da tela inicial."}
          </span>
        </div>
        <button onClick={install} className="flex-none rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
          Instalar
        </button>
        <button onClick={hide} aria-label="Agora não" className="-mr-1 flex h-8 w-8 flex-none items-center justify-center rounded-full text-xl leading-none text-stone-400 transition hover:bg-stone-100 hover:text-stone-600">
          ×
        </button>
      </div>

      {steps && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={() => setSteps(false)}>
          <div
            role="dialog"
            aria-label="Como instalar o app"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl motion-safe:animate-[sacola_.25s_ease-out]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone-200" />
            <div className="flex items-center gap-3">
              <AppIcon name={name} logoUrl={logoUrl} />
              <div>
                <h2 className="text-lg font-bold leading-tight text-stone-900">Instale o app {name}</h2>
                <p className="text-sm text-stone-500">Leva 10 segundos e não ocupa espaço.</p>
              </div>
            </div>
            <ol className="mt-5 space-y-4 text-[15px] text-stone-700">
              <li className="flex gap-3">
                <Step n={1} />
                <span>
                  Toque no botão <strong>Compartilhar</strong> <IconShare /> do Safari.
                  <span className="block text-sm text-stone-500">Se não aparecer, toque antes em <strong>•••</strong> ao lado do endereço.</span>
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={2} />
                <span>
                  Escolha <strong>Adicionar à Tela de Início</strong> <IconAdd />
                  <span className="block text-sm text-stone-500">Se não estiver na lista, role a lista para baixo.</span>
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={3} />
                <span>Toque em <strong>Adicionar</strong>. O ícone da loja aparece junto com os seus apps.</span>
              </li>
            </ol>
            <button onClick={() => setSteps(false)} className="mt-6 w-full rounded-full bg-stone-900 py-3 text-[15px] font-semibold text-white">
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function AppIcon({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" className="h-11 w-11 flex-none rounded-xl bg-white object-cover shadow-sm ring-1 ring-stone-900/10" />
  ) : (
    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-sm">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Step({ n }: { n: number }) {
  return <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-brand-600/20">{n}</span>;
}

function IconShare() {
  return (
    <svg viewBox="0 0 24 24" className="mx-0.5 inline h-5 w-5 -translate-y-0.5 text-sky-600" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

function IconAdd() {
  return (
    <svg viewBox="0 0 24 24" className="mx-0.5 inline h-5 w-5 -translate-y-0.5 text-stone-700" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}
