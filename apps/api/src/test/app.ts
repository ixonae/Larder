import { createApp } from "../app.ts";
import { openDb } from "../db/client.ts";
import { runMigrations } from "../db/migrate.ts";
import { DEFAULT_USER, seedUser } from "../db/seed.ts";
import { createLogger } from "../logger.ts";

export const ALICE = DEFAULT_USER;
export const BOB = { email: "bob@larder.local", display_name: "Bob" } as const;

/**
 * Fresh in-memory database, migrated and seeded with two users who each own one bar:
 * Alice (the default user) owns "Alice's bar", Bob owns "Bob's bar". Requests act as `as` (Alice by default).
 */
export function createTestApp({ as = ALICE.email }: { as?: string } = {}) {
  const db = openDb(":memory:");
  runMigrations(db);
  const alice = seedUser(db, ALICE, "Alice's bar");
  const bob = seedUser(db, BOB, "Bob's bar");
  const lines: string[] = [];
  const logger = createLogger("debug", (l) => lines.push(l));
  const app = createApp({ logger, db, userEmail: as });
  const logs = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { app, db, alice, bob, logs };
}
