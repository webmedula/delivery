// Service worker do app do cardápio (WebTenda).
// Não guarda nada em cache: o cardápio, os preços e os pedidos vêm sempre da internet.
// Só mostra um aviso amigável quando o celular está sem conexão, em vez da tela de erro.
const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sem internet</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f5f5f4;color:#1c1917;text-align:center;padding:24px;box-sizing:border-box}
button{margin-top:16px;border:0;border-radius:999px;background:#1c1917;color:#fff;font:600 15px system-ui;padding:12px 22px}</style></head>
<body><div><div style="font-size:44px">📶</div><h1 style="font-size:20px;margin:12px 0 6px">Você está sem internet</h1>
<p style="margin:0;color:#57534e">Confira a conexão do celular e tente de novo.</p>
<button onclick="location.reload()">Tentar de novo</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith((async () => {
    try {
      return (await event.preloadResponse) || (await fetch(event.request));
    } catch {
      return new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
  })());
});
