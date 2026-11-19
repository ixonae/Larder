import type { BarSummary } from "@larder/shared";
import type { Db, Tx } from "../../db/client.ts";
import { forbidden, notFound, parseId } from "../../errors.ts";
import { seedStarterCategories } from "../categories/starter.ts";
import { findBarForMember, insertBar } from "./repo.ts";

/**
 * The bar `barId` as seen by `userId`. Unknown or malformed ids are `NOT_FOUND`; a bar the user
 * is not a member of is `FORBIDDEN`.
 */
export function resolveBarAccess(db: Db, barId: string | undefined, userId: string): BarSummary {
  const bar = findBarForMember(db, parseId(barId, "Bar"), userId);
  if (!bar) throw notFound("Bar");
  if (!bar.role) throw forbidden("You are not a member of this bar");
  return { id: bar.id, name: bar.name, role: bar.role };
}

/** Creates a bar owned by `ownerId`, with the owner membership and the starter categories. */
export function createBar(tx: Tx, { name, ownerId }: { name: string; ownerId: string }): string {
  const barId = insertBar(tx, name, ownerId);
  seedStarterCategories(tx, barId, ownerId);
  return barId;
}
