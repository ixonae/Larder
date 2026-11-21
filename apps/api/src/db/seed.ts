import { eq } from "drizzle-orm";
import { createBar } from "../modules/bars/service.ts";
import type { Db } from "./client.ts";
import { bars, users } from "./schema/index.ts";

export const DEFAULT_USER = { email: "owner@larder.local", display_name: "Owner" } as const;
export const DEFAULT_BAR_NAME = "My bar";

/**
 * Makes sure a user exists with at least one bar they own. Idempotent: running it again changes nothing.
 * Returns the ids of the user and of their first owned bar.
 */
export function seedUser(
  db: Db,
  user: { email: string; display_name: string } = DEFAULT_USER,
  barName: string = DEFAULT_BAR_NAME,
): { userId: string; barId: string } {
  return db.transaction((tx) => {
    tx.insert(users).values(user).onConflictDoNothing({ target: users.email }).run();
    const { id: userId } = tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email))
      .get() as { id: string };

    const owned = tx
      .select({ id: bars.id })
      .from(bars)
      .where(eq(bars.owner_id, userId))
      .orderBy(bars.created_at, bars.id)
      .get();
    if (owned) return { userId, barId: owned.id };

    return { userId, barId: createBar(tx, { name: barName, ownerId: userId }) };
  });
}

/** Startup seed: the single default user and their bar. */
export const seed = (db: Db): { userId: string; barId: string } => seedUser(db);
