import { SESSION_REQUEST_HEADER } from "@larder/shared";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { sessions } from "../db/schema/index.ts";
import {
  ALICE,
  cookieFor,
  createTestApp,
  errorOf,
  jsonRequest,
  type TestApp,
} from "../test/app.ts";
import { SESSION_COOKIE } from "./middleware.ts";
import { hashPassword } from "./password.ts";
import { requireOwnerAccount, setOwnerPassword } from "./service.ts";
import { hashToken } from "./token.ts";

const PASSWORD = "correct horse battery staple";
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function setup(publicUrl?: string): Omit<TestApp, "cookie"> & {
  cookie: string;
  signIn: (
    email?: string,
    password?: string,
    cookie?: string,
    remoteAddress?: string,
  ) => Response | Promise<Response>;
} {
  const t = createTestApp({ publicUrl });
  setOwnerPassword(t.db, t.alice.userId, passwordHash, false);
  const signIn = (
    email: string = ALICE.email as string,
    password: string = PASSWORD,
    cookie: string = "",
    remoteAddress: string = "192.0.2.1",
  ): Response | Promise<Response> =>
    t.rawRequest(
      "/api/auth/sign-in",
      {
        ...jsonRequest("POST", { email, password }),
        headers: {
          "Content-Type": "application/json",
          [SESSION_REQUEST_HEADER]: "1",
          Cookie: cookie,
          "X-Forwarded-For": "192.0.2.222",
        },
      },
      { incoming: { socket: { remoteAddress } } },
    );
  const cookie = cookieFor(t.db, t.alice.userId);
  return { ...t, cookie, signIn };
}

describe("session authentication", () => {
  it("requires explicit owner setup before the server can start", () => {
    const { db, alice } = createTestApp();
    expect(() => requireOwnerAccount(db)).toThrow("pnpm setup-owner");
    expect(setOwnerPassword(db, alice.userId, passwordHash, false)).toBe(true);
    expect(() => requireOwnerAccount(db)).not.toThrow();
  });

  it("protects tenant data and images and keeps health public", async () => {
    const { rawRequest, alice } = setup();
    for (const path of ["/api/me", `/api/bars/${alice.barId}/cocktails`, "/api/images/missing"]) {
      const res = await rawRequest(path, { headers: { Authorization: "Basic YTpi" } });
      expect(res.status).toBe(401);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect((await rawRequest("/api/health")).status).toBe(200);
  });

  it("sets a secure cookie, persists only its hash, rotates the session, and revokes it on sign-out", async () => {
    const { rawRequest, signIn, db, alice } = setup("https://bar.example.test");
    const first = await signIn(ALICE.email.toUpperCase());
    expect(first.status).toBe(204);
    const cookie = first.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/Path=\//);
    const previous = cookie.split(";")[0] as string;
    const token = previous.slice(`${SESSION_COOKIE}=`.length);
    expect(
      db
        .select()
        .from(sessions)
        .where(eq(sessions.token_hash, hashToken(token)))
        .get(),
    ).toMatchObject({ user_id: alice.userId });
    expect(db.select().from(sessions).where(eq(sessions.token_hash, token)).get()).toBeUndefined();
    const session = await rawRequest("/api/me", { headers: { Cookie: previous } });
    expect(await session.json()).toMatchObject({
      user: { id: alice.userId },
      bars: [{ id: alice.barId }],
    });
    const second = await signIn(ALICE.email, PASSWORD, previous);
    const current = second.headers.get("Set-Cookie")?.split(";")[0] as string;
    expect(current).not.toBe(previous);
    expect((await rawRequest("/api/me", { headers: { Cookie: previous } })).status).toBe(401);

    const logout = await rawRequest("/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: current, [SESSION_REQUEST_HEADER]: "1" },
    });
    expect(logout.status).toBe(204);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await rawRequest("/api/me", { headers: { Cookie: current } })).status).toBe(401);
  });

  it("refuses expired sessions and removes them on the next sign-in", async () => {
    const { rawRequest, cookie, db, signIn } = setup();
    db.update(sessions).set({ expires_at: "2000-01-01T00:00:00.000Z" }).run();
    expect((await rawRequest("/api/me", { headers: { Cookie: cookie } })).status).toBe(401);
    expect((await signIn()).status).toBe(204);
    expect(db.select().from(sessions).all()).toHaveLength(1);
  });

  it("requires the same-origin request header for state changes", async () => {
    const { rawRequest, cookie } = setup();
    const res = await rawRequest("/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: cookie as string, Origin: "https://example.test" },
    });
    expect(res.status).toBe(403);
    expect((await rawRequest("/api/me", { headers: { Cookie: cookie as string } })).status).toBe(
      200,
    );
  });

  it("gives unknown accounts and incorrect passwords the same error", async () => {
    const { signIn } = setup();
    const unknown = await signIn("unknown@example.test");
    const wrong = await signIn(ALICE.email, "wrong");
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await errorOf(unknown)).toEqual(await errorOf(wrong));
  });

  it("throttles repeated failures by transport peer and ignores forwarded addresses", async () => {
    const { signIn } = setup();
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await signIn(ALICE.email, "wrong")).status).toBe(401);
    }
    const response = await signIn("unknown@example.test", "wrong");
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await errorOf(response)).toMatchObject({ code: "RATE_LIMITED" });
    expect((await signIn(ALICE.email, PASSWORD, "", "192.0.2.2")).status).toBe(204);
  });

  it("returns a retryable error when the verification queue fills", async () => {
    const { signIn } = setup();
    const responses = await Promise.all(
      Array.from({ length: 7 }, () => signIn(ALICE.email, "wrong")),
    );
    const busy = responses.find((res) => res.status === 503);
    expect(busy?.headers.get("Retry-After")).toBe("1");
    expect(await busy?.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });
    expect(responses.filter((res) => res.status === 401)).toHaveLength(6);
    expect((await signIn()).status).toBe(204);
  });
});

it("uses the public URL to verify browser mutations behind a reverse proxy", async () => {
  const origin = "https://bar.example.test";
  const { rawRequest, cookie } = setup(origin);
  for (const [requestOrigin, status] of [
    ["https://other.example.test", 403],
    [origin, 204],
  ] as const) {
    const res = await rawRequest("/api/auth/sign-out", {
      method: "POST",
      headers: { Origin: requestOrigin, [SESSION_REQUEST_HEADER]: "1", Cookie: cookie as string },
    });
    expect(res.status).toBe(status);
  }
  const unconfigured = setup();
  expect(
    (
      await unconfigured.rawRequest("/api/auth/sign-out", {
        method: "POST",
        headers: { Origin: "http://localhost:5173", [SESSION_REQUEST_HEADER]: "1" },
      })
    ).status,
  ).toBe(204);
});

it("applies separate limits to proxied clients and authenticated account changes", async () => {
  const t = createTestApp({ trustedProxy: "192.0.2.1" });
  const signup = async (peer: string, client?: string): Promise<number> => {
    const init = jsonRequest("POST", {
      email: ALICE.email,
      display_name: "Test",
      password: PASSWORD,
    });
    const response = await t.rawRequest(
      "/api/auth/sign-up",
      {
        ...init,
        headers: {
          ...init.headers,
          [SESSION_REQUEST_HEADER]: "1",
          ...(client && { "X-Real-IP": client }),
        },
      },
      { incoming: { socket: { remoteAddress: peer } } },
    );
    return response.status;
  };
  // Invite-only signup exercises the attempt limiter without performing a password hash.
  for (let i = 0; i < 10; i++) {
    expect(await signup("::ffff:192.0.2.1", "2001:db8::7")).toBe(403);
    expect(await signup("192.0.2.44", "192.0.2.60")).toBe(403);
    expect(await signup("192.0.2.1")).toBe(403);
  }
  expect(await signup("192.0.2.1", "2001:0db8::8")).toBe(429);
  expect(await signup("192.0.2.1", "2001:db8:0:1::7")).toBe(403);
  expect(await signup("192.0.2.1", "192.0.2.8")).toBe(403);
  expect(await signup("192.0.2.44", "192.0.2.61")).toBe(429);
  expect(await signup("192.0.2.1", "192.0.2.61, 192.0.2.62")).toBe(429);

  const response = await t.app.request(
    "/api/me/email",
    { ...jsonRequest("PATCH", { email: ALICE.email, current_password: "incorrect" }) },
    { incoming: { socket: { remoteAddress: "192.0.2.1" } } },
  );
  expect(response.status).toBe(400);
});
