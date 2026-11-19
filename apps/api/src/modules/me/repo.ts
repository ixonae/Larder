import type { BarSummary, User } from "@larder/shared";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../../db/client.ts";
import { barMembers, bars, users } from "../../db/schema/index.ts";

export function findUserByEmail(db: Db, email: string): User | undefined {
  return db
    .select({ id: users.id, email: users.email, display_name: users.display_name })
    .from(users)
    .where(eq(users.email, email))
    .get();
}

export function listBarsForUser(db: Db, userId: string): BarSummary[] {
  return db
    .select({ id: bars.id, name: bars.name, role: barMembers.role })
    .from(barMembers)
    .innerJoin(bars, eq(bars.id, barMembers.bar_id))
    .where(eq(barMembers.user_id, userId))
    .orderBy(asc(bars.name), asc(bars.id))
    .all();
}
