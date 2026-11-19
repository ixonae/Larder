import { describe, expect, it, vi } from "vitest";
import { verifyPassword } from "../auth/password.ts";
import { type Io, main, muteableOutput } from "./hash-password.ts";

function fakeIo(interactive: boolean, ...answers: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    interactive,
    readPassword: vi.fn(async () => answers.shift() ?? ""),
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  };
  return { io, out, err };
}

describe("hash-password", () => {
  it("prints a hash that verifies the password", async () => {
    const { io, out } = fakeIo(false, "a long enough secret");
    expect(await main(io)).toBe(0);
    expect(await verifyPassword("a long enough secret", out[0] as string)).toBe(true);
  });

  it("refuses short passwords", async () => {
    const { io, out, err } = fakeIo(false, "short");
    expect(await main(io)).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["Use at least 12 characters."]);
  });

  it("asks twice on a terminal and refuses a mismatch", async () => {
    const { io, err } = fakeIo(true, "a long enough secret", "a different secret");
    expect(await main(io)).toBe(1);
    expect(err).toEqual(["The passwords do not match."]);
  });

  it("accepts a matching confirmation on a terminal", async () => {
    const { io, out } = fakeIo(true, "a long enough secret", "a long enough secret");
    expect(await main(io)).toBe(0);
    expect(out).toHaveLength(1);
  });
});

describe("muteableOutput", () => {
  it("forwards writes until muted, then drops them", async () => {
    const written: string[] = [];
    const target = { write: (chunk: Buffer) => written.push(chunk.toString()) };
    const output = muteableOutput(target as unknown as NodeJS.WritableStream);
    await new Promise((resolve) => output.stream.write("Password: ", resolve));
    output.mute();
    await new Promise((resolve) => output.stream.write("secret", resolve));
    expect(written).toEqual(["Password: "]);
  });
});
