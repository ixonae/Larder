import type { Context } from "hono";
import { rateLimited } from "../errors.ts";
import type { AppEnv } from "../types.ts";

/** Bounded fixed window. At capacity, new keys must wait for the next window. */
export function rateLimit(
  max: number,
  windowMs: number = 60_000,
  maxKeys: number = 2048,
): (key: string) => void {
  const counts = new Map<string, number>();
  let resetAt = 0;
  return (key: string): void => {
    const now = Date.now();
    if (now >= resetAt) {
      counts.clear();
      resetAt = now + windowMs;
    }
    const count = counts.get(key) ?? 0;
    if (count >= max || (!counts.has(key) && counts.size >= maxKeys)) {
      throw rateLimited(Math.ceil((resetAt - now) / 1000));
    }
    counts.set(key, count + 1);
  };
}

/** Use the transport peer. Forwarded headers from arbitrary callers are untrusted. */
export const peerKey = (c: Context<AppEnv>): string =>
  c.env?.incoming.socket.remoteAddress ?? "local";
