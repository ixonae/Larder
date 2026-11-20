import type { AdminBar, BarMember, Role } from "@larder/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.ts";
import { barMembers, bars, images, users } from "../../db/schema/index.ts";

/** Inserts a bar and its owner membership (two rows, hence a transaction). */
export function insertBar(db: Tx, id: string, name: string, ownerId: string): void {
  db.insert(bars).values({ id, name, owner_id: ownerId }).run();
  db.insert(barMembers).values({ bar_id: id, user_id: ownerId, role: "owner" }).run();
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

export function listMembers(db: Db, barId: string): BarMember[] {
  return db
    .select({ id: users.id, display_name: users.display_name, role: barMembers.role })
    .from(barMembers)
    .innerJoin(users, eq(users.id, barMembers.user_id))
    .where(eq(barMembers.bar_id, barId))
    .orderBy(sql`larder_name_key(${users.display_name})`, users.id)
    .all();
}

export function listAllBars(db: Db): AdminBar[] {
  return db
    .select({
      id: bars.id,
      name: bars.name,
      owner: { id: users.id, display_name: users.display_name },
    })
    .from(bars)
    .innerJoin(users, eq(users.id, bars.owner_id))
    .orderBy(sql`larder_name_key(${bars.name})`, bars.id)
    .all();
}

export function listBarImageFiles(tx: Tx, barId: string) {
  return tx
    .select({ storage_key: images.storage_key, thumb_key: images.thumb_key })
    .from(images)
    .where(eq(images.bar_id, barId))
    .all();
}

export function findBarName(db: Tx, barId: string): string | undefined {
  return db.select({ name: bars.name }).from(bars).where(eq(bars.id, barId)).get()?.name;
}

export function updateBarName(db: Db, barId: string, name: string): void {
  db.update(bars).set({ name }).where(eq(bars.id, barId)).run();
}

export function deleteBar(db: Tx, barId: string): void {
  db.delete(bars).where(eq(bars.id, barId)).run();
}
