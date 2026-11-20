import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDateSchema, isoDateTimeSchema, nowIso, todayIso } from "./time.ts";

describe("nowIso", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats the current time as ISO-8601 UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:34:56.789Z"));
    expect(nowIso()).toBe("2026-11-19T12:34:56.789Z");
  });

  it("formats a given date", () => {
    expect(nowIso(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
  });

  it("produces values accepted by isoDateTimeSchema", () => {
    expect(isoDateTimeSchema.safeParse(nowIso()).success).toBe(true);
    expect(isoDateTimeSchema.safeParse("19/11/2026").success).toBe(false);
  });
});

describe("todayIso", () => {
  it("is the UTC date, accepted by isoDateSchema", () => {
    expect(todayIso(new Date("2026-11-19T23:59:59.000Z"))).toBe("2026-11-19");
    expect(isoDateSchema.safeParse(todayIso()).success).toBe(true);
    expect(isoDateSchema.safeParse("2026-02-30").success).toBe(false);
  });
});
