import { Hono } from "hono";
import { afterEach, expect, it, vi } from "vitest";
import type { AppEnv } from "../types.ts";
import { peerKey, rateLimit } from "./rate-limit.ts";

afterEach(() => vi.useRealTimers());

it("bounds attempts and distinct keys, and opens a new window after Retry-After", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const check = rateLimit(2, 5000, 2);
  check("first");
  check("first");
  check("second");
  vi.setSystemTime(1100);
  expect(() => check("first")).toThrow(
    expect.objectContaining({ code: "RATE_LIMITED", headers: { "Retry-After": "4" } }),
  );
  expect(() => check("third")).toThrow(
    expect.objectContaining({ headers: { "Retry-After": "4" } }),
  );
  check("second");
  vi.setSystemTime(5000);
  expect(() => check("third")).not.toThrow();
  expect(() => check("first")).not.toThrow();
});

const trustedProxy = "2001:db8:1:2::5";
const app = new Hono<AppEnv>().get("/", (c) => {
  c.set("trustedProxy", trustedProxy);
  return c.text(peerKey(c));
});

it.each([
  ["2001:db8:1:2::5", "2001:db8:3:4::1", "2001:db8:3:4::/64"],
  ["2001:db8:1:2::5", "2001:DB8:3:4:5:6:7:8", "2001:db8:3:4::/64"],
  ["2001:db8:1:2::6", "2001:db8:3:4::1", "2001:db8:1:2::/64"],
  ["2001:db8:1:2::7", "192.0.2.5", "2001:db8:1:2::/64"],
  ["2001:db8:1:3::7", "192.0.2.5", "2001:db8:1:3::/64"],
  ["2001:db8:1:2::5%en0", "192.0.2.5", "2001:db8:1:2::/64"],
  ["2001:db8:1:2::5", "fe80::3%en0", "2001:db8:1:2::/64"],
  ["fe80::ab%en0", "192.0.2.5", "fe80:0:0:0::/64"],
  ["::192.0.2.5", "192.0.2.6", "0:0:0:0::/64"],
  ["::ffff:c000:0205", "192.0.2.6", "192.0.2.5"],
])("peer %s with X-Real-IP %s uses rate-limit key %s", async (remoteAddress, client, key) => {
  const response = await app.request(
    "/",
    { headers: { "X-Real-IP": client } },
    {
      incoming: { socket: { remoteAddress } },
    },
  );
  expect(await response.text()).toBe(key);
});

it("uses the local budget without a transport address", async () => {
  const response = await app.request("/", { headers: { "X-Real-IP": "192.0.2.5" } });
  expect(await response.text()).toBe("local");
});
