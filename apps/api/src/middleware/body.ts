import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { concurrencyLimit } from "../auth/limit.ts";
import { requireCurrentUser } from "../auth/middleware.ts";
import { AppError, invalid, rateLimited } from "../errors.ts";
import type { AppEnv } from "../types.ts";

export const MAX_PUBLIC_BODY_BYTES = 16 * 1024;
export const PUBLIC_BODY_TIMEOUT_MS = 15_000;
export const AUTHENTICATED_BODY_TIMEOUT_MS = 120_000;
const MAX_PUBLIC_BODIES_PER_PEER = 2;
const MAX_AUTHENTICATED_BODIES_PER_USER = 2;
const BUSY_MESSAGE = "Request body processing is busy. Try again shortly.";

function requestBody(c: Context<AppEnv>): Request["body"] {
  // The Node HTTP/1 adapter exposes a stream even for an unframed or zero-length POST/DELETE.
  if (
    c.env?.incoming.httpVersionMajor === 1 &&
    !c.req.header("transfer-encoding") &&
    Number(c.req.header("content-length") ?? 0) === 0
  )
    return null;
  return c.req.raw.body;
}

/**
 * Count the actual bytes for both fixed-length and chunked bodies before running any handler, and
 * give up once `timeoutMs` has passed.
 */
async function bufferBody(
  c: Context<AppEnv>,
  body: NonNullable<Request["body"]>,
  maxSize: number,
  timeoutMs: number,
): Promise<void> {
  const tooLarge = (): AppError =>
    new AppError("PAYLOAD_TOO_LARGE", `Request body is larger than ${maxSize} bytes`);
  if (Number(c.req.header("content-length")) > maxSize) throw tooLarge();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(invalid("Request body timed out")), timeoutMs);
  let buffer = new Uint8Array(0);
  let size = 0;
  try {
    await body.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk: Uint8Array): void {
          const end = size + chunk.byteLength;
          if (end > maxSize) throw tooLarge();
          if (end > buffer.length) {
            const grown = new Uint8Array(Math.min(maxSize, Math.max(end, buffer.length * 2)));
            grown.set(buffer);
            buffer = grown;
          }
          buffer.set(chunk, size);
          size = end;
        },
      }),
      { signal: controller.signal },
    );
  } catch (err) {
    // A client that disconnects mid-body is a bad request, not a server failure.
    if (err instanceof AppError) throw err;
    throw invalid("Request body was not received");
  } finally {
    clearTimeout(timer);
  }
  // Rebuild from plain fields: the Node adapter's lightweight request is not a native `Request`.
  const { raw } = c.req;
  c.req.raw = new Request(raw.url, {
    method: raw.method,
    headers: raw.headers,
    signal: raw.signal,
    body: buffer.subarray(0, size),
  });
}

/** At most `max` tasks per key at once; the next one for a busy key is refused as rate limited. */
function limitPerKey(max: number): <T>(key: string, task: () => Promise<T>) => Promise<T> {
  const keys = new Map<string, { active: number }>();
  return async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const entry = keys.get(key) ?? { active: 0 };
    if (entry.active >= max) throw rateLimited(1);
    entry.active++;
    keys.set(key, entry);
    try {
      return await task();
    } finally {
      entry.active--;
      if (entry.active === 0) keys.delete(key);
    }
  };
}

export function admitAuthenticatedBodies(maxSize: number): MiddlewareHandler<AppEnv> {
  const run = concurrencyLimit(4, 0, BUSY_MESSAGE);
  // One account cannot take every slot and lock other users out of writes.
  const perUser = limitPerKey(MAX_AUTHENTICATED_BODIES_PER_USER);
  return createMiddleware<AppEnv>((c, next) => {
    requireCurrentUser(c);
    const body = requestBody(c);
    if (!body) return next();
    return perUser(c.var.user.id, () =>
      run(async () => {
        await bufferBody(c, body, maxSize, AUTHENTICATED_BODY_TIMEOUT_MS);
        // The session may have expired or been revoked while the bytes arrived.
        requireCurrentUser(c);
        await next();
      }),
    );
  });
}

export function admitPublicBodies(configuredLimit: number): MiddlewareHandler<AppEnv> {
  const maxSize = Math.min(configuredLimit, MAX_PUBLIC_BODY_BYTES);
  const run = concurrencyLimit(8, 0, BUSY_MESSAGE);
  const perPeer = limitPerKey(MAX_PUBLIC_BODIES_PER_PEER);
  return createMiddleware<AppEnv>((c, next) => {
    const body = requestBody(c);
    if (!body) return next();
    const peer = c.env?.incoming.socket.remoteAddress ?? "local";
    return run(() =>
      perPeer(peer, async () => {
        await bufferBody(c, body, maxSize, PUBLIC_BODY_TIMEOUT_MS);
        await next();
      }),
    );
  });
}
