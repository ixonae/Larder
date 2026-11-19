import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "../auth/password.ts";
import { type Io, main } from "./hash-password.ts";

function fakeIo(...answers: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    readPassword: vi.fn(async () => answers.shift() ?? ""),
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  };
  return { io, out, err };
}

describe("hash-password", () => {
  afterEach(() => {
    process.stdin.isTTY = false as never;
  });

  it("prints a hash that verifies the password", async () => {
    const { io, out } = fakeIo("a long enough secret");
    expect(await main(io)).toBe(0);
    expect(await verifyPassword("a long enough secret", out[0] as string)).toBe(true);
  });

  it("refuses short passwords", async () => {
    const { io, out, err } = fakeIo("short");
    expect(await main(io)).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["Use at least 12 characters."]);
  });

  it("asks twice on a terminal and refuses a mismatch", async () => {
    process.stdin.isTTY = true;
    const { io, err } = fakeIo("a long enough secret", "a different secret");
    expect(await main(io)).toBe(1);
    expect(err).toEqual(["The passwords do not match."]);
  });

  it("accepts a matching confirmation on a terminal", async () => {
    process.stdin.isTTY = true;
    const { io, out } = fakeIo("a long enough secret", "a long enough secret");
    expect(await main(io)).toBe(0);
    expect(out).toHaveLength(1);
  });
});
