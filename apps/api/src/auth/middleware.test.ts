import { beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../test/app.ts";
import { hashPassword } from "./password.ts";

const PASSWORD = "correct horse battery";
let passwordHash: string;
const basic = (user: string, password: string) => ({
  Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
});

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

describe("access control", () => {
  it("allows requests without credentials when no password is configured", async () => {
    const { app } = createTestApp();
    expect((await app.request("/api/me")).status).toBe(200);
  });

  it("refuses requests without credentials when a password is configured", async () => {
    const { app } = createTestApp({ passwordHash });
    const res = await app.request("/api/me");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Basic realm="Larder"/);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
  });

  it("refuses a wrong password", async () => {
    const { app } = createTestApp({ passwordHash });
    expect((await app.request("/api/me", { headers: basic("me", "wrong") })).status).toBe(401);
  });

  it("accepts the right password with any username, repeatedly", async () => {
    const { app } = createTestApp({ passwordHash });
    expect((await app.request("/api/me", { headers: basic("me", PASSWORD) })).status).toBe(200);
    expect((await app.request("/api/me", { headers: basic("you", PASSWORD) })).status).toBe(200);
    expect((await app.request("/api/me", { headers: basic("me", "wrong") })).status).toBe(401);
  });

  it("keeps /api/health open", async () => {
    const { app } = createTestApp({ passwordHash });
    expect((await app.request("/api/health")).status).toBe(200);
  });

  it("protects unknown routes too", async () => {
    const { app } = createTestApp({ passwordHash });
    expect((await app.request("/api/nope")).status).toBe(401);
  });
});
