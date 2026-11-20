import { readFileSync } from "node:fs";
import type { ImageStorage } from "../../storage/storage.ts";
import type { Db } from "../client.ts";
import { barDataMigrations, bars } from "../schema/index.ts";
import {
  type Catalogue,
  catalogueCategorySchema,
  catalogueRecipeSchema,
  catalogueRecord,
  catalogueSourceSchema,
  importCatalogue,
} from "./import.ts";

function lines(file: string) {
  return readFileSync(new URL(file, import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/);
}

const catalogue: Catalogue = {
  id: "starter-catalogue-v1",
  categories: lines("./categories.txt")
    .slice(1)
    .flatMap((line) => {
      const [kind, parent, children] = line.split("|");
      return (children as string)
        .split(", ")
        .map((child) =>
          catalogueCategorySchema.parse({ kind, path: `${parent}/${child}`.split("/") }),
        );
    }),
  sources: lines("./sources.jsonl").map((line) => catalogueSourceSchema.parse(JSON.parse(line))),
  recipes: [...lines("./classic-recipes.jsonl"), ...lines("./basic-recipes.jsonl")].map((line) =>
    catalogueRecipeSchema.parse(JSON.parse(line)),
  ),
  // To bundle pictures, map a target key (use categoryPictureKey for categories) to readFileSync(new URL("./images/example.jpg", import.meta.url)).
  pictures: new Map(),
};
const optedOut = `${catalogue.id}-opt-out`;

/** Defaults to the starter pack. A future bar-creation flow can pass false for this bar. */
export async function seedStarterCatalogue(
  db: Db,
  storage: ImageStorage,
  barId: string,
  enabled = true,
) {
  if (!enabled) {
    db.insert(barDataMigrations)
      .values({ bar_id: barId, migration: optedOut })
      .onConflictDoNothing()
      .run();
    return;
  }
  if (db.select().from(barDataMigrations).where(catalogueRecord(barId, optedOut)).get()) return;
  await importCatalogue(db, storage, barId, catalogue);
}

/** Backfill existing bars and seed the default bar once it has been created. */
export async function migrateStarterCatalogues(db: Db, storage: ImageStorage) {
  const allBars = db.select({ id: bars.id }).from(bars).all();
  for (const { id } of allBars) await seedStarterCatalogue(db, storage, id);
}
