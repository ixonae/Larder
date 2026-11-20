import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ErrorBody, SESSION_REQUEST_HEADER } from "@larder/shared";
import { createApp } from "../app.ts";
import { SESSION_COOKIE } from "../auth/middleware.ts";
import { createSession } from "../auth/service.ts";
import type { Db } from "../db/client.ts";
import { openDb } from "../db/client.ts";
import { runMigrations } from "../db/migrate.ts";
import { DEFAULT_USER, seedUser } from "../db/seed.ts";
import { createLogger } from "../logger.ts";
import { createDiskStorage } from "../storage/storage.ts";

export const ALICE = DEFAULT_USER;

/** A `Cookie` header value for a new session of `userId`. */
export const cookieFor = (db: Db, userId: string) =>
  `${SESSION_COOKIE}=${createSession(db, userId)}`;
export const BOB = { email: "bob@larder.local", display_name: "Bob" } as const;

/**
 * Fresh in-memory database, migrated and seeded with two users who each own one bar:
 * Alice (the default user) owns "Alice's bar", Bob owns "Bob's bar". Requests act as `as` (Alice by default).
 */
export function createTestApp({
  as = ALICE.email,
  publicUrl,
  webDir,
  maxBodyBytes,
}: {
  as?: string;
  publicUrl?: string;
  webDir?: string;
  maxBodyBytes?: number;
} = {}) {
  const db = openDb(":memory:");
  runMigrations(db);
  const alice = seedUser(db, ALICE, "Alice's bar");
  const bob = seedUser(db, BOB, "Bob's bar");
  const lines: string[] = [];
  const logger = createLogger("debug", (l) => lines.push(l));
  // Uploads go to a fresh temporary directory per app.
  const uploads = mkdtempSync(join(tmpdir(), "larder-uploads-"));
  const storage = createDiskStorage(uploads);
  const app = createApp({
    logger,
    db,
    storage,
    publicUrl,
    webDir,
    ...(maxBodyBytes !== undefined && { maxBodyBytes }),
  });
  const rawRequest = app.request.bind(app);
  const actor = new Map([
    [ALICE.email as string, alice],
    [BOB.email, bob],
  ]).get(as);
  const cookie = actor && cookieFor(db, actor.userId);
  app.request = (input, init, env, executionCtx) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => {
      headers.set(name, value);
    });
    if (cookie && !headers.has("Cookie")) headers.set("Cookie", cookie);
    headers.set(SESSION_REQUEST_HEADER, "1");
    return rawRequest(input, { ...init, headers }, env, executionCtx);
  };
  const logs = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { app, rawRequest, cookie, db, storage, uploads, alice, bob, logs };
}

export const readJson = async <T>(res: Response) => (await res.json()) as T;
export const errorOf = async (res: Response) => (await readJson<ErrorBody>(res)).error;

/**
 * `RequestInit` for `app.request()`: the method, plus a JSON body when one is given, and a `Cookie`
 * header replacing the default actor's when `cookie` is given (`""` sends the request signed out).
 */
export const jsonRequest = (method: string, body?: unknown, cookie?: string): RequestInit => ({
  method,
  headers: {
    ...(body !== undefined && { "content-type": "application/json" }),
    ...(cookie !== undefined && { Cookie: cookie }),
  },
  ...(body !== undefined && { body: JSON.stringify(body) }),
});
