import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ErrorBody } from "@larder/shared";
import { createApp } from "../app.ts";
import { openDb } from "../db/client.ts";
import { runMigrations } from "../db/migrate.ts";
import { DEFAULT_USER, seedUser } from "../db/seed.ts";
import { createLogger } from "../logger.ts";
import { createDiskStorage } from "../storage/storage.ts";

export const ALICE = DEFAULT_USER;
export const BOB = { email: "bob@larder.local", display_name: "Bob" } as const;

/**
 * Fresh in-memory database, migrated and seeded with two users who each own one bar:
 * Alice (the default user) owns "Alice's bar", Bob owns "Bob's bar". Requests act as `as` (Alice by default).
 */
export function createTestApp({
  as = ALICE.email,
  passwordHash,
  webDir,
  maxBodyBytes,
}: {
  as?: string;
  passwordHash?: string;
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
    userEmail: as,
    passwordHash,
    webDir,
    ...(maxBodyBytes !== undefined && { maxBodyBytes }),
  });
  const logs = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { app, db, storage, uploads, alice, bob, logs };
}

export const readJson = async <T>(res: Response) => (await res.json()) as T;
export const errorOf = async (res: Response) => (await readJson<ErrorBody>(res)).error;

/** `RequestInit` for `app.request()`: the method, plus a JSON body when one is given. */
export const jsonRequest = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
});
