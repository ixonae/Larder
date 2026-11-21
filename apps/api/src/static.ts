import { serveStatic } from "@hono/node-server/serve-static";
import type { Context, MiddlewareHandler, Next } from "hono";
import type { AppEnv } from "./types.ts";

const IMMUTABLE = "public, max-age=31536000, immutable";
const ASSETS = "/assets/";

/**
 * Serves the built web app from `root` and falls back to `index.html` for client-side routes.
 * `/api/*` is never handled here, so unknown API routes still get the JSON 404.
 * Vite fingerprints files under `/assets/`, so they are cached for a year and a missing one is a 404
 * (never `index.html`, which a stale tab would try to run as a script); everything else is revalidated.
 */
export function webApp(root: string): MiddlewareHandler<AppEnv> {
  const files = serveStatic<AppEnv>({ root });
  const index = serveStatic<AppEnv>({ root, path: "index.html" });
  const noop = async (): Promise<void> => {};

  return async (c: Context<AppEnv>, next: Next) => {
    const path = c.req.path;
    if (path === "/api" || path.startsWith("/api/")) return next();
    const isAsset = path.startsWith(ASSETS);
    const res = (await files(c, noop)) ?? (isAsset ? undefined : await index(c, noop));
    if (!res) return next();
    res.headers.set("Cache-Control", isAsset ? IMMUTABLE : "no-cache");
    return res;
  };
}
