import type { BarSummary, CreateBar, RenameBar } from "@larder/shared";
import { addStarterCatalogue, skipStarterCatalogue } from "../../db/catalogue/starter.ts";
import type { Db, Tx } from "../../db/client.ts";
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
export function resolveBarAccess(db: Db, barId: string | undefined, userId: string): BarSummary {
  const bar = repo.findBarForMember(db, parseId(barId, "Bar"), userId);
  if (!bar) throw notFound("Bar");
  if (!bar.role) throw forbidden("You are not a member of this bar");
  return { id: bar.id, name: bar.name, role: bar.role };
}

/** Creates a bar owned by `ownerId`, with the owner membership, starter categories and pantry. */
export function createBar(tx: Tx, { name, ownerId }: { name: string; ownerId: string }): string {
  const barId = repo.insertBar(tx, name, ownerId);
  seedStarterPantry(tx, barId, ownerId, seedStarterCategories(tx, barId, ownerId));
  return barId;
}

export function createOwnedBar(
  db: Db,
  ownerId: string,
  { name, seed_data }: CreateBar,
): BarSummary {
  return db.transaction((tx) => {
    if (seed_data) {
      const id = createBar(tx, { name, ownerId });
      addStarterCatalogue(tx, id, ownerId);
      return { id, name, role: "owner" };
    }
    const id = repo.insertBar(tx, name, ownerId);
    skipStarterCatalogue(tx, id);
    return { id, name, role: "owner" };
  });
}

export const barMembers = (db: Db, barId: string) => ({ members: repo.listMembers(db, barId) });
export const barDirectory = (db: Db) => ({ bars: repo.listAllBars(db) });

export function renameBar({ db, barId, role }: Ctx, { name }: RenameBar): BarSummary {
  repo.updateBarName(db, barId, name);
  return { id: barId, name, role };
}

export async function removeBar(db: Db, storage: ImageStorage, id: string, confirmedName: string) {
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
