import type { AdminBar, BarMember, CurrencyCode, Role, UpdateBarMember } from "@larder/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db, Executor, Tx } from "../../db/client.ts";
import { barMembers, bars, images, users } from "../../db/schema/index.ts";

/** Inserts a bar and its owner membership (two rows, hence a transaction). */
export function insertBar(
  db: Tx,
  id: string,
  name: string,
  ownerId: string,
  currency: CurrencyCode,
): void {
  db.insert(bars).values({ id, name, owner_id: ownerId, currency }).run();
  db.insert(barMembers).values({ bar_id: id, user_id: ownerId, role: "owner" }).run();
}

/** The fields of a `BarSummary` that come from the bar itself (the role comes from the membership). */
export const barSummaryColumns: Pick<typeof bars, "id" | "name" | "currency"> = {
  id: bars.id,
  name: bars.name,
  currency: bars.currency,
};

/** The bar with the user's role in it (`null` when they are not a member), or undefined if it does not exist. */
export function findBarForMember(
  db: Executor,
  barId: string,
  userId: string,
): { id: string; name: string; currency: CurrencyCode; role: Role | null } | undefined {
  return db
    .select({ ...barSummaryColumns, role: barMembers.role })
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

export function updateMember(
  db: Tx,
  barId: string,
  userId: string,
  changes: UpdateBarMember,
): void {
  db.update(barMembers)
    .set(changes)
    .where(and(eq(barMembers.bar_id, barId), eq(barMembers.user_id, userId)))
    .run();
}

export function deleteMember(db: Tx, barId: string, userId: string): void {
  db.delete(barMembers)
    .where(and(eq(barMembers.bar_id, barId), eq(barMembers.user_id, userId)))
    .run();
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

export function listBarImageFiles(
  tx: Tx,
  barId: string,
): { storage_key: string; thumb_key: string }[] {
  return tx
    .select({ storage_key: images.storage_key, thumb_key: images.thumb_key })
    .from(images)
    .where(eq(images.bar_id, barId))
    .all();
}

export function findBarName(db: Tx, barId: string): string | undefined {
  return db.select({ name: bars.name }).from(bars).where(eq(bars.id, barId)).get()?.name;
}

export function updateBar(
  db: Db,
  barId: string,
  changes: { name?: string; currency?: CurrencyCode },
): void {
  db.update(bars).set(changes).where(eq(bars.id, barId)).run();
}

export function deleteBar(db: Tx, barId: string): void {
  db.delete(bars).where(eq(bars.id, barId)).run();
}
