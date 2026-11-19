import type { Role } from "@larder/shared";
import { and, eq } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { barMembers, bars } from "../../db/schema/index.ts";

/** Inserts a bar and its owner membership (two rows, hence a transaction); returns the new bar id. */
export function insertBar(db: Tx, name: string, ownerId: string): string {
  const { id } = db
    .insert(bars)
    .values({ name, owner_id: ownerId })
    .returning({ id: bars.id })
    .get();
  db.insert(barMembers).values({ bar_id: id, user_id: ownerId, role: "owner" }).run();
  return id;
}

/** The bar with the user's role in it (`null` when they are not a member), or undefined if it does not exist. */
export function findBarForMember(
  db: Db,
  barId: string,
  userId: string,
): { id: string; name: string; role: Role | null } | undefined {
  return db
    .select({ id: bars.id, name: bars.name, role: barMembers.role })
    .from(bars)
    .leftJoin(barMembers, and(eq(barMembers.bar_id, bars.id), eq(barMembers.user_id, userId)))
    .where(eq(bars.id, barId))
    .get();
}
