import { describe, expect, it } from "vitest";
import { hashPassword, isPasswordHash, PASSWORD_HASH_PATTERN, verifyPassword } from "./password.ts";

const SALT = "BwcHBwcHBwcHBwcHBwcHBw";
const KEY = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc";

describe("password hashing", () => {
  it("hashes to the documented format with a random salt", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).toMatch(PASSWORD_HASH_PATTERN);
    expect(a.startsWith("scrypt:32768:8:1:")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
  });

  it.each([
    ["an unsupported cost", `scrypt:1048576:8:1:${SALT}:${KEY}`],
    ["noncanonical salt", `scrypt:32768:8:1:${SALT.slice(0, -1)}x:${KEY}`],
    ["noncanonical key", `scrypt:32768:8:1:${SALT}:${KEY.slice(0, -1)}d`],
    ["a malformed hash", "not-a-hash"],
    ["a cost that is not a power of two", `scrypt:32767:8:1:${SALT}:${KEY}`],
    ["a zero r", `scrypt:32768:0:1:${SALT}:${KEY}`],
    ["a zero p", `scrypt:32768:8:0:${SALT}:${KEY}`],
    ["an empty key (would match any password)", `scrypt:32768:8:1:${SALT}:a`],
    ["a too short salt", `scrypt:32768:8:1:c2FsdA:${KEY}`],
  ])("never matches %s", async (_, hash) => {
    expect(isPasswordHash(hash)).toBe(false);
    expect(await verifyPassword("anything", hash)).toBe(false);
  });
});
