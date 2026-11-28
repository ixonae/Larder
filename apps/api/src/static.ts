import { serveStatic } from "@hono/node-server/serve-static";
import { Context, type MiddlewareHandler, type Next } from "hono";
import { COMPRESSIBLE_CONTENT_TYPE_REGEX } from "hono/compress";
import { parseAccept } from "hono/utils/accept";
import type { AppEnv } from "./types.ts";

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const ASSETS = "/assets/";
const MIN_COMPRESS_BYTES = 1024;

function acceptsGzip(acceptEncoding: string): boolean {
  const encodings = parseAccept(acceptEncoding);
  const gzip = encodings.find(({ type }) => type.toLowerCase() === "gzip");
  const wildcard = encodings.find(({ type }) => type === "*");
  return (gzip?.q ?? wildcard?.q ?? 0) > 0;
}

function canCompress(res: Response): boolean {
  const total = res.headers.get("Content-Range")?.split("/").at(-1);
  return (
    Number(total ?? res.headers.get("Content-Length")) >= MIN_COMPRESS_BYTES &&
    COMPRESSIBLE_CONTENT_TYPE_REGEX.test(String(res.headers.get("Content-Type")))
  );
}

/** Select the same representation for GET and HEAD. HEAD has no stream to compress. */
function compressStatic(res: Response, gzip: boolean): Response {
  if (!canCompress(res)) return res;
  res.headers.append("Vary", "Accept-Encoding");
  if (!gzip) return res;

  res.headers.set("Content-Encoding", "gzip");
  res.headers.delete("Content-Length");
  return res.body ? new Response(res.body.pipeThrough(new CompressionStream("gzip")), res) : res;
}

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
  const read = async (c: Context<AppEnv>, asset: boolean): Promise<Response | undefined> => {
    const response = (await files(c, noop)) ?? (asset ? undefined : await index(c, noop));
    return response || undefined;
  };

  return async (c: Context<AppEnv>, next: Next) => {
    const path = c.req.path;
    if (path === "/api" || path.startsWith("/api/")) return next();
    const isAsset = path.startsWith(ASSETS);
    const gzip = acceptsGzip(c.req.header("Accept-Encoding") ?? "");
    let fileContext = c;
    const range = c.req.method === "GET" && Boolean(c.req.header("Range"));
    if (gzip && range) {
      // We can stream a full gzip representation, but cannot seek within it.
      const options = { env: c.env, path };
      const metadata = await read(
        new Context<AppEnv>(new Request(c.req.raw, { method: "HEAD" }), options),
        isAsset,
      );
      if (metadata && canCompress(metadata)) {
        const headers = new Headers(c.req.raw.headers);
        headers.delete("Range");
        fileContext = new Context<AppEnv>(new Request(c.req.raw, { headers }), options);
      }
    }
    const res = await read(fileContext, isAsset);
    if (!res) return next();
    res.headers.set("Cache-Control", isAsset ? IMMUTABLE_CACHE_CONTROL : "no-cache");
    return compressStatic(res, gzip && (!range || fileContext !== c));
  };
}
