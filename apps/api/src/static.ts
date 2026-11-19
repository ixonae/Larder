import { serveStatic } from "@hono/node-server/serve-static";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "./types.ts";

const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * Serves the built web app from `root` and falls back to `index.html` for client-side routes.
 * `/api/*` is never handled here, so unknown API routes still get the JSON 404.
 * Vite fingerprints files under `/assets/`, so they are cached for a year; everything else is revalidated.
 */
export function webApp(root: string): MiddlewareHandler<AppEnv> {
  // serveStatic calls onFound after building its response, so remember the file and set headers afterwards.
  const served = new WeakMap<Context, string>();
  const onFound = (path: string, c: Context<AppEnv>) => {
    served.set(c, path);
  };
  const assets = serveStatic<AppEnv>({ root, onFound });
  const index = serveStatic<AppEnv>({ root, path: "index.html", onFound });

  const noop = async () => {};
  const withCacheHeader = (c: Context<AppEnv>, res: Response) => {
    const path = served.get(c) as string;
    res.headers.set("Cache-Control", path.includes("/assets/") ? IMMUTABLE : "no-cache");
    return res;
  };

  return async (c, next) => {
    if (c.req.path === "/api" || c.req.path.startsWith("/api/")) return next();
    const res = (await assets(c, noop)) ?? (await index(c, noop));
    return res ? withCacheHeader(c, res) : next();
  };
}
