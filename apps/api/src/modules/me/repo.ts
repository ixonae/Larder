import type { BarSummary } from "@larder/shared";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client.ts";
import { barMembers, bars } from "../../db/schema/index.ts";

export function listBarsForUser(db: Db, userId: string): BarSummary[] {
  return db
    .select({ id: bars.id, name: bars.name, role: barMembers.role })
    .from(barMembers)
    .innerJoin(bars, eq(bars.id, barMembers.bar_id))
    .where(eq(barMembers.user_id, userId))
    .orderBy(asc(sql`larder_name_key(${bars.name})`), asc(bars.id))
    .all();
}
