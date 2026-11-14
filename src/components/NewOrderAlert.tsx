"use client";

import { useEffect, useRef, useState } from "react";

const PREF_KEY = "painel:som";
const REMIND_SECONDS = 30;

/**
 * Toca um aviso quando chega pedido novo e repete a cada 30 segundos enquanto
 * houver pedido esperando ser aceito. Mostra o número de pedidos novos na aba do navegador.
 */
export function NewOrderAlert({ pendingIds }: { pendingIds: string[] }) {
  const [enabled, setEnabled] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const key = pendingIds.join(",");

  useEffect(() => {
    try { if (localStorage.getItem(PREF_KEY) === "off") setEnabled(false); } catch {}
    // O navegador só libera o som depois de um clique na página.
    const ac = audio();
    if (ac && ac.state !== "running") setBlocked(true);
    const unlock = () => { void audio()?.resume().then(() => setBlocked(false)).catch(() => {}); };
    document.addEventListener("pointerdown", unlock);
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  function audio() {
    if (typeof window === "undefined") return null;
    if (!ctx.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx.current = new AC();
    }
    return ctx.current;
  }

  function ring() {
    const ac = audio();
    if (!ac) return;
    if (ac.state !== "running") {
      setBlocked(true);
      void ac.resume().catch(() => {});
      return;
    }
    play(ac);
  }

  function play(ac: AudioContext) {
    // Três toques curtos, tipo campainha.
    [0, 0.22, 0.44].forEach((at, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 2 ? 1175 : 880;
      const t = ac.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.21);
    });
  }

  // Pedido novo desde a última atualização da tela: toca.
  useEffect(() => {
    document.title = pendingIds.length ? `(${pendingIds.length}) Pedido novo · WebTenda` : "Pedidos · WebTenda";
    if (seen.current === null) {
      seen.current = new Set(pendingIds);
      return;
    }
    const fresh = pendingIds.filter((id) => !seen.current!.has(id));
    pendingIds.forEach((id) => seen.current!.add(id));
    if (fresh.length > 0 && enabled) ring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Lembrete enquanto houver pedido esperando.
  useEffect(() => {
    if (!enabled || pendingIds.length === 0) return;
    const id = setInterval(ring, REMIND_SECONDS * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem(PREF_KEY, next ? "on" : "off"); } catch {}
    if (next) ring();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={toggle} className={enabled ? "btn-ghost" : "btn-ghost text-stone-500"} aria-pressed={enabled}>
        {enabled ? "🔔 Som ligado" : "🔕 Som desligado"}
      </button>
      {enabled && blocked && (
        <button type="button" onClick={() => { void audio()?.resume().then(() => { setBlocked(false); ring(); }).catch(() => {}); }} className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
          Toque aqui para liberar o som de pedido novo
        </button>
      )}
    </div>
  );
}
