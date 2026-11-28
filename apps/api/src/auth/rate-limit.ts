import { isIP, SocketAddress } from "node:net";
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

/** Canonical keys also make IPv4-mapped IPv6 peers match an IPv4 proxy setting. */
function ipKey(value: string): string | undefined {
  const family = isIP(value);
  if (!family || value.includes("%")) return undefined;
  return new SocketAddress({
    address: value,
    family: family === 4 ? "ipv4" : "ipv6",
  }).address.replace(/^::ffff:(?=\d+\.)/, "");
}

/** IPv4 clients have individual budgets. Rotating interface IDs share one IPv6 /64 budget. */
function clientKey(address: string): string {
  if (!address.includes(":")) return address;
  // The URL serializer writes embedded IPv4 tails as hex, so every IPv6 address has eight groups.
  const hex = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const omitted = 8 - hex.split(":").filter(Boolean).length;
  const expanded = hex.replace("::", `:${"0:".repeat(omitted)}`);
  return `${expanded.split(":").filter(Boolean).slice(0, 4).join(":")}::/64`;
}

/** A single trusted ingress overwrites X-Real-IP with its verified client address. */
export function peerKey(c: Context<AppEnv>): string {
  const { trustedProxy } = c.var;
  const remote = c.env?.incoming.socket.remoteAddress ?? "";
  // A socket's interface zone is local routing information. Never use it to establish proxy trust.
  const peer = ipKey(remote.replace(/%.*$/, ""));
  if (!peer) return "local";
  if (trustedProxy && !remote.includes("%") && peer === ipKey(trustedProxy)) {
    return clientKey(ipKey(c.req.header("X-Real-IP") ?? "") ?? peer);
  }
  return clientKey(peer);
}
