// The browser stores the worker itself, so the offline page needs no separate cache.
const offlinePage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1c1a19" />
    <title>Larder is offline</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body {
        box-sizing: border-box;
        display: grid;
        place-items: center;
        min-height: 100dvh;
        margin: 0;
        padding: 1.5rem;
        color: CanvasText;
        background: Canvas;
      }
      main { width: min(100%, 24rem); }
      h1 { margin: 0; font-size: 1.75rem; }
      p { line-height: 1.5; }
      a {
        display: inline-grid;
        min-height: 2.75rem;
        align-items: center;
        padding: 0 1rem;
        border-radius: 0.5rem;
        background: #284581;
        color: #fff;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Larder is offline</h1>
      <p>Reconnect to your Larder server to access your bar.</p>
      <a href="">Try again</a>
    </main>
  </body>
</html>`;

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate" || request.method !== "GET") return;

  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  event.respondWith(
    fetch(request).catch(
      () =>
        new Response(offlinePage, {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
          },
        }),
    ),
  );
});
