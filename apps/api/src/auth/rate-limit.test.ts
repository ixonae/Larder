import { afterEach, expect, it, vi } from "vitest";
import { rateLimit } from "./rate-limit.ts";

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
