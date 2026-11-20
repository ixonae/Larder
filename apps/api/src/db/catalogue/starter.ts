import { readFileSync } from "node:fs";
import { type CategoryKind, createUtensilSchema, nameKey, type UtensilKind } from "@larder/shared";
import type { ImageStorage } from "../../storage/storage.ts";
import type { Ctx } from "../../types.ts";
import type { Db, Executor, Tx } from "../client.ts";
import { barDataMigrations, bars } from "../schema/index.ts";
import {
  applyCatalogue,
  type Catalogue,
  catalogueCategorySchema,
  catalogueRecipeSchema,
  catalogueRecord,
  catalogueSourceSchema,
  categoryPictureKey,
  importCatalogue,
  withCataloguePictures,
} from "./import.ts";

function lines(file: string) {
  return readFileSync(new URL(file, import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/);
}

const recipes = [...lines("./classic-recipes.jsonl"), ...lines("./basic-recipes.jsonl")].map(
  (line) => catalogueRecipeSchema.parse(JSON.parse(line)),
);
const glassware = lines("./glassware.txt").map((name) =>
  createUtensilSchema.shape.name.parse(name),
);
const glassNames = new Set([...recipes.map(({ glass }) => glass), ...glassware]);
const tools = lines("./tools.txt").map((name) => createUtensilSchema.shape.name.parse(name));

const rootCategories = [
  ["Beer", "beer"],
  ["Bitters", "bitters"],
  ["Garnish", "garnish"],
  ["Juice", "juice"],
  ["Liqueur", "liqueur"],
  ["Mixer", "mixer"],
  ["Pantry", "other"],
  ["Spirit", "spirit"],
  ["Syrup", "syrup"],
  ["Wine", "wine"],
] as const satisfies readonly (readonly [string, CategoryKind])[];

function readIcon(directory: string, slug: string) {
  return {
    full: readFileSync(new URL(`./${directory}/${slug}.webp`, import.meta.url)),
    thumb: readFileSync(new URL(`./${directory}/thumbnails/${slug}.webp`, import.meta.url)),
    width: 512,
    height: 512,
  };
}

const rootCategoryPictures = new Map(
  rootCategories.map(([name]) => [
    categoryPictureKey([name]),
    readIcon("category-icons", nameKey(name)),
  ]),
);
const rootCategoryCatalogue: Catalogue = {
  id: "starter-root-category-icons-v1",
  categories: [],
  sources: [],
  recipes: [],
  pictures: rootCategoryPictures,
  existingRootPictureKinds: new Map(
    rootCategories.map(([name, kind]) => [categoryPictureKey([name]), kind]),
  ),
};

function utensilPicture(kind: UtensilKind, name: string) {
  const directory = { glass: "glassware-icons", tool: "tool-icons" }[kind];
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("&", "and")
    .replaceAll(" ", "-");
  return [`${kind}:${name}`, readIcon(directory, slug)] as const;
}

const utensilPictures = new Map([
  ...[...glassNames].map((name) => utensilPicture("glass", name)),
  ...tools.map((name) => utensilPicture("tool", name)),
]);

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
  recipes,
  glassware,
  tools,
  pictures: utensilPictures,
};
const optedOut = `${catalogue.id}-opt-out`;
const newBarPictures = new Map([...utensilPictures, ...rootCategoryPictures]);

/** Stage the icons, then create the bar and its full starter catalogue in one transaction. */
export async function addStarterCatalogue(
  ctx: Pick<Ctx, "db" | "storage" | "barId" | "userId">,
  initializeBar: (tx: Tx) => void,
) {
  const { db, barId, userId } = ctx;
  await withCataloguePictures(ctx, newBarPictures, (staged) =>
    db.transaction((tx) => {
      initializeBar(tx);
      const used = applyCatalogue(tx, barId, userId, catalogue, staged);
      tx.insert(barDataMigrations)
        .values({ bar_id: barId, migration: rootCategoryCatalogue.id })
        .run();
      return used;
    }),
  );
}

export function skipStarterCatalogue(db: Executor, barId: string): void {
  db.insert(barDataMigrations)
    .values({ bar_id: barId, migration: optedOut })
    .onConflictDoNothing()
    .run();
}

/** Imports the starter pack unless the bar opted out. */
export async function seedStarterCatalogue(db: Db, storage: ImageStorage, barId: string) {
  if (db.select().from(barDataMigrations).where(catalogueRecord(barId, optedOut)).get()) return;
  await importCatalogue(db, storage, barId, catalogue);
  await importCatalogue(db, storage, barId, rootCategoryCatalogue);
}

/** Backfill existing bars and seed the default bar once it has been created. */
export async function migrateStarterCatalogues(db: Db, storage: ImageStorage) {
  const allBars = db.select({ id: bars.id }).from(bars).all();
  for (const { id } of allBars) await seedStarterCatalogue(db, storage, id);
}
