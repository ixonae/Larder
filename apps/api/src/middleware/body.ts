import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { concurrencyLimit } from "../auth/limit.ts";
import { requireCurrentUser } from "../auth/middleware.ts";
import { peerKey } from "../auth/rate-limit.ts";
import { AppError, invalid, rateLimited } from "../errors.ts";
import type { AppEnv } from "../types.ts";

export const MAX_PUBLIC_BODY_BYTES = 16 * 1024;
export const PUBLIC_BODY_TIMEOUT_MS = 15_000;
const MAX_PUBLIC_BODIES_PER_PEER = 2;
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

/** Count the actual bytes for both fixed-length and chunked bodies before running any handler. */
async function bufferBody(
  c: Context<AppEnv>,
  body: NonNullable<Request["body"]>,
  maxSize: number,
  signal?: AbortSignal,
): Promise<void> {
  const tooLarge = (): AppError =>
    new AppError("PAYLOAD_TOO_LARGE", `Request body is larger than ${maxSize} bytes`);
  if (Number(c.req.header("content-length")) > maxSize) throw tooLarge();
  let buffer = new Uint8Array(0);
  let size = 0;
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
    { signal },
  );
  c.req.raw = new Request(c.req.raw, { body: buffer.subarray(0, size) });
}

export function admitAuthenticatedBodies(maxSize: number): MiddlewareHandler<AppEnv> {
  const run = concurrencyLimit(4, 0, BUSY_MESSAGE);
  return createMiddleware<AppEnv>((c, next) => {
    requireCurrentUser(c);
    const body = requestBody(c);
    if (!body) return next();
    return run(async () => {
      await bufferBody(c, body, maxSize);
      // The session may have expired or been revoked while the bytes arrived.
      requireCurrentUser(c);
      await next();
    });
  });
}

async function readPublicBody(
  c: Context<AppEnv>,
  body: NonNullable<Request["body"]>,
  maxSize: number,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(invalid("Request body timed out")),
    PUBLIC_BODY_TIMEOUT_MS,
  );
  try {
    await bufferBody(c, body, maxSize, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function admitPublicBodies(configuredLimit: number): MiddlewareHandler<AppEnv> {
  const maxSize = Math.min(configuredLimit, MAX_PUBLIC_BODY_BYTES);
  const run = concurrencyLimit(8, 0, BUSY_MESSAGE);
  const peers = new Map<string, { active: number }>();
  return createMiddleware<AppEnv>((c, next) => {
    const body = requestBody(c);
    if (!body) return next();
    const key = peerKey(c);
    return run(async () => {
      const peer = peers.get(key) ?? { active: 0 };
      if (peer.active >= MAX_PUBLIC_BODIES_PER_PEER) throw rateLimited(1);
      peer.active++;
      peers.set(key, peer);
      try {
        await readPublicBody(c, body, maxSize);
        await next();
      } finally {
        peer.active--;
        if (peer.active === 0) peers.delete(key);
      }
    });
  });
}
