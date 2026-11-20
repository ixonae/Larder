import type { AdminUser } from "@larder/shared";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { adminUserColumns } from "../../auth/repo.ts";
import type { Tx } from "../../db/client.ts";
import {
  barInvitations,
  bars,
  categories,
  cocktailIngredientAlternatives,
  cocktailIngredients,
  cocktailSteps,
  cocktails,
  cocktailTags,
  cocktailUtensils,
  images,
  pantryIngredients,
  productPurchases,
  products,
  tags,
  users,
  utensils,
} from "../../db/schema/index.ts";

/** Shared bar data a user is credited on. Their personal feedback is deleted with them instead. */
const attributedTables = [
  barInvitations,
  categories,
  cocktailIngredientAlternatives,
  cocktailIngredients,
  cocktails,
  cocktailSteps,
  cocktailTags,
  cocktailUtensils,
  images,
  pantryIngredients,
  productPurchases,
  products,
  tags,
  utensils,
];

/** Admins manage every account except the installation admin's. */
const manageable = (id: string) => and(eq(users.id, id), eq(users.is_admin, false));

export function findManageableUser(db: Tx, id: string) {
  return db.select({ email: users.email }).from(users).where(manageable(id)).get();
}

export function setUserAccess(db: Tx, id: string, disabled: boolean): AdminUser | undefined {
  return db.update(users).set({ disabled }).where(manageable(id)).returning(adminUserColumns).get();
}

/** Finds the bars that would lose their owner or a record's author if the user were deleted. */
export function listUserBarReferences(db: Tx, userId: string) {
  return db
    .select({ id: bars.id, name: bars.name })
    .from(bars)
    .where(
      or(
        eq(bars.owner_id, userId),
        ...attributedTables.map((table) =>
          inArray(
            bars.id,
            db.select({ id: table.bar_id }).from(table).where(eq(table.created_by, userId)),
          ),
        ),
      ),
    )
    .orderBy(sql`larder_name_key(${bars.name})`, bars.id)
    .all();
}

export function deleteUser(db: Tx, id: string): void {
  db.delete(users).where(eq(users.id, id)).run();
}
