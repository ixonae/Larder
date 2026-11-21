import {
  type AdminBar,
  type BarMember,
  type BarSummary,
  type CreateBar,
  type CurrencyCode,
  DEFAULT_CURRENCY,
  newId,
  type UpdateBar,
  type UpdateBarMember,
} from "@larder/shared";
import { addStarterCatalogue, skipStarterCatalogue } from "../../db/catalogue/starter.ts";
import type { Db, Executor, Tx } from "../../db/client.ts";
import { conflict, forbidden, notFound, parseId } from "../../errors.ts";
import type { ImageStorage } from "../../storage/storage.ts";
import type { Ctx } from "../../types.ts";
import { seedStarterCategories } from "../categories/starter.ts";
import { removeImageFiles } from "../images/service.ts";
import { seedStarterPantry } from "../pantry/starter.ts";
import * as repo from "./repo.ts";

/**
 * The bar `barId` as seen by `userId`. Unknown or malformed ids are `NOT_FOUND`; a bar the user
 * is not a member of is `FORBIDDEN`.
 */
export function resolveBarAccess(
  db: Executor,
  barId: string | undefined,
  userId: string,
): BarSummary {
  const bar = repo.findBarForMember(db, parseId(barId, "Bar"), userId);
  if (!bar) throw notFound("Bar");
  const { role, ...summary } = bar;
  if (!role) throw forbidden("You are not a member of this bar");
  return { ...summary, role };
}

/** Creates a bar owned by `ownerId`, with the owner membership, starter categories and pantry. */
export function createBar(
  tx: Tx,
  {
    name,
    ownerId,
    barId = newId(),
    currency = DEFAULT_CURRENCY,
  }: { name: string; ownerId: string; barId?: string; currency?: CurrencyCode },
): string {
  repo.insertBar(tx, barId, name, ownerId, currency);
  seedStarterPantry(tx, barId, ownerId, seedStarterCategories(tx, barId, ownerId));
  return barId;
}

export async function createOwnedBar(
  db: Db,
  storage: ImageStorage,
  ownerId: string,
  { name, currency, seed_data }: CreateBar,
): Promise<BarSummary> {
  const barId = newId();
  if (seed_data) {
    await addStarterCatalogue({ db, storage, barId, userId: ownerId }, (tx) => {
      createBar(tx, { name, ownerId, barId, currency });
    });
  } else {
    db.transaction((tx) => {
      repo.insertBar(tx, barId, name, ownerId, currency);
      skipStarterCatalogue(tx, barId);
    });
  }
  return { id: barId, name, currency, role: "owner" };
}

export const barMembers = (db: Db, barId: string): { members: BarMember[] } => ({
  members: repo.listMembers(db, barId),
});
export const barDirectory = (db: Db): { bars: AdminBar[] } => ({ bars: repo.listAllBars(db) });

function requireEditableMember(db: Tx, barId: string, id: string): string {
  const userId = parseId(id, "Bar member");
  const role = repo.findBarForMember(db, barId, userId)?.role;
  if (!role) throw notFound("Bar member");
  if (role === "owner") throw conflict("The bar owner's membership cannot be changed.");
  return userId;
}

export function updateBarMember({ db, barId }: Ctx, id: string, changes: UpdateBarMember): void {
  db.transaction(
    (tx) => repo.updateMember(tx, barId, requireEditableMember(tx, barId, id), changes),
    { behavior: "immediate" },
  );
}

export function removeBarMember({ db, barId }: Ctx, id: string): void {
  db.transaction((tx) => repo.deleteMember(tx, barId, requireEditableMember(tx, barId, id)), {
    behavior: "immediate",
  });
}

/** The owner's changes to the bar's name and/or currency; the rest of the bar stays as it was. */
export function updateBar({ db, barId }: Ctx, bar: BarSummary, patch: UpdateBar): BarSummary {
  repo.updateBar(db, barId, patch);
  return { ...bar, ...patch };
}

export async function removeBar(
  db: Db,
  storage: ImageStorage,
  id: string,
  confirmedName: string,
): Promise<void> {
  const barId = parseId(id, "Bar");
  const files = db.transaction(
    (tx) => {
      const name = repo.findBarName(tx, barId);
      if (name === undefined) throw notFound("Bar");
      if (name !== confirmedName) throw conflict("Type the current bar name exactly to delete it.");
      const images = repo.listBarImageFiles(tx, barId);
      repo.deleteBar(tx, barId);
      return images;
    },
    { behavior: "immediate" },
  );
  await Promise.all(files.map((image) => removeImageFiles(storage, image)));
}
