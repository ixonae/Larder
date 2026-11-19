import { afterEach, describe, expect, it, vi } from "vitest";
import { formatUuidV7, idSchema, newId } from "./id.ts";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const timestampOf = (id: string) => Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
const seqOf = (id: string) => Number.parseInt(id.slice(15, 18), 16);

describe("formatUuidV7", () => {
  it("encodes the timestamp, version, sequence and variant", () => {
    const ts = Date.UTC(2026, 10, 19, 12, 0, 0, 123);
    const id = formatUuidV7(ts, 0xabc, new Uint8Array(8).fill(0xff));
    expect(id).toMatch(UUID_V7);
    expect(timestampOf(id)).toBe(ts);
    expect(seqOf(id)).toBe(0xabc);
    expect(id.slice(19)).toBe("bfff-ffffffffffff");
  });
});

describe("newId", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a valid UUIDv7 with the current time", () => {
    const before = Date.now();
    const id = newId();
    expect(idSchema.safeParse(id).success).toBe(true);
    expect(id).toMatch(UUID_V7);
    expect(timestampOf(id)).toBeGreaterThanOrEqual(before);
  });

  it("is strictly increasing, even within the same millisecond", () => {
    vi.useFakeTimers({ now: Date.UTC(2030, 0, 1) });
    const ids = Array.from({ length: 1000 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(1000);
  });

  it("borrows the next millisecond when the sequence is exhausted", () => {
    vi.useFakeTimers({ now: Date.UTC(2031, 0, 1) });
    const ids = Array.from({ length: 0x1000 }, () => newId());
    const last = ids.at(-1) as string;
    expect(timestampOf(last)).toBe(Date.UTC(2031, 0, 1) + 1);
    expect([...ids].sort()).toEqual(ids);
  });

  it("stays increasing when the clock goes back", () => {
    vi.useFakeTimers({ now: Date.UTC(2032, 0, 1) });
    const a = newId();
    vi.setSystemTime(Date.UTC(2031, 0, 1));
    const b = newId();
    expect(b > a).toBe(true);
  });
});

describe("idSchema", () => {
  it("rejects non-UUID strings", () => {
    expect(idSchema.safeParse("not-an-id").success).toBe(false);
  });
});
