import { describe, expect, it } from "vitest";
import { hashPassword, PASSWORD_HASH_PATTERN, verifyPassword } from "./password.ts";

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
    ["a malformed hash", "not-a-hash"],
    ["invalid cost parameters", "scrypt:3:8:1:c2FsdA:a2V5"],
  ])("never matches %s", async (_, hash) => {
    expect(await verifyPassword("anything", hash)).toBe(false);
  });
});
