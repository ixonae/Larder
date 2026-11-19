import { type BarSummary, idSchema } from "@larder/shared";
import type { Db } from "../../db/client.ts";
import { forbidden, notFound } from "../../errors.ts";
import { findBarForMember } from "./repo.ts";

/**
 * The bar `barId` as seen by `userId`. Unknown or malformed ids are `NOT_FOUND`; a bar the user
 * is not a member of is `FORBIDDEN`.
 */
export function resolveBarAccess(db: Db, barId: string | undefined, userId: string): BarSummary {
  const parsed = idSchema.safeParse(barId);
  if (!parsed.success) throw notFound("Bar");
  const bar = findBarForMember(db, parsed.data, userId);
  if (!bar) throw notFound("Bar");
  if (!bar.role) throw forbidden("You are not a member of this bar");
  return { id: bar.id, name: bar.name, role: bar.role };
}
