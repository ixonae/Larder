import { describe, expect, it, vi } from "vitest";
import { verifyPassword } from "../auth/password.ts";
import { findCredentials } from "../auth/repo.ts";
import { openDb } from "../db/client.ts";
import { runMigrations } from "../db/migrate.ts";
import { DEFAULT_USER } from "../db/seed.ts";
import { cookieFor, createTestApp } from "../test/app.ts";
import { type Io, main, muteableOutput } from "./setup-owner.ts";

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

function freshDb() {
  const db = openDb(":memory:");
  runMigrations(db);
  return db;
}

const password = "a long enough secret";
const replacement = "a different secret";
const owner = DEFAULT_USER.email;

describe("setup-owner", () => {
  it("sets up the owner account without printing a password or hash", async () => {
    const { io, out } = fakeIo(false, password);
    const db = freshDb();
    expect(await main(io, db)).toBe(0);
    expect(out).toEqual([`Owner account ready. Sign in as ${owner}.`]);
    expect(
      await verifyPassword(password, findCredentials(db, "email", owner)?.hash as string),
    ).toBe(true);
  });

  it.each(["short", "a".repeat(257)])(
    "rejects passwords outside accepted lengths",
    async (value) => {
      const { io, out, err } = fakeIo(false, value);
      expect(await main(io, freshDb())).toBe(1);
      expect(out).toEqual([]);
      expect(err).toEqual(["Use 15 to 256 characters."]);
    },
  );

  it("asks twice on a terminal and refuses a mismatch", async () => {
    const { io, err } = fakeIo(true, password, replacement);
    expect(await main(io, freshDb())).toBe(1);
    expect(err).toEqual(["The passwords do not match."]);
  });

  it("preserves the existing owner identity and replaces the password only on an explicit reset", async () => {
    const { db, app, alice } = createTestApp();
    expect(await main(fakeIo(true, password, password).io, db)).toBe(0);
    const hasPassword = fakeIo(false, replacement);
    expect(await main(hasPassword.io, db)).toBe(1);
    expect(hasPassword.err[0]).toContain("already set up");
    const before = findCredentials(db, "email", owner);
    expect(before?.userId).toBe(alice.userId);
    expect(await verifyPassword(password, before?.hash as string)).toBe(true);
    const cookie = cookieFor(db, alice.userId);
    const readMe = () => app.request("/api/me", { headers: { Cookie: cookie } });
    expect((await readMe()).status).toBe(200);
    expect(await main(fakeIo(false, replacement).io, db, true)).toBe(0);
    const after = findCredentials(db, "email", owner);
    expect(after?.userId).toBe(alice.userId);
    expect(await verifyPassword(replacement, after?.hash as string)).toBe(true);
    expect((await readMe()).status).toBe(401);
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
