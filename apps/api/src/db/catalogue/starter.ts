import { readFileSync } from "node:fs";
import { type CategoryKind, createUtensilSchema, nameKey, type UtensilKind } from "@larder/shared";
import { createLogger, type Logger } from "../../logger.ts";
import {
  legacyArtworkCandidates,
  type StoredImage,
  setArtworkKey,
} from "../../modules/images/repo.ts";
import type { ProcessedImage } from "../../storage/process.ts";
import type { ImageStorage } from "../../storage/storage.ts";
import type { Ctx } from "../../types.ts";
import type { Db, Executor, Tx } from "../client.ts";
import { barDataMigrations, bars } from "../schema/index.ts";
import {
  artworkKey,
  availableArtworkKey,
  bundledArtworkSizes,
  registerArtwork,
} from "./artwork.ts";
import { starterCategoryPictures } from "./category-art.ts";
import {
  applyCatalogue,
  type Catalogue,
  catalogueCategorySchema,
  catalogueRecipeSchema,
  catalogueRecord,
  catalogueSourceSchema,
  categoryPictureKey,
  importCatalogue,
  pantryPictureKey,
  withCataloguePictures,
} from "./import.ts";

function lines(file: string): string[] {
  return readFileSync(new URL(file, import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/);
}

const sources = lines("./sources.jsonl").map((line) =>
  catalogueSourceSchema.parse(JSON.parse(line)),
);
const recipes = [...lines("./classic-recipes.jsonl"), ...lines("./basic-recipes.jsonl")].map(
  (line) => catalogueRecipeSchema.parse(JSON.parse(line)),
);
const glassware = lines("./glassware.txt").map((name) =>
  createUtensilSchema.shape.name.parse(name),
);
const glassNames = new Set([...recipes.map(({ glass }) => glass), ...glassware]);
const tools = lines("./tools.txt").map((name) => createUtensilSchema.shape.name.parse(name));

const rootCategories: ReadonlyArray<readonly [string, CategoryKind]> = [
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
];

function readIcon(directory: string, slug: string, side: number = 512): ProcessedImage {
  return registerArtwork({
    full: readFileSync(new URL(`./${directory}/${slug}.webp`, import.meta.url)),
    thumb: readFileSync(new URL(`./${directory}/thumbnails/${slug}.webp`, import.meta.url)),
    width: side,
    height: side,
  });
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

function pantryIconSlug(name: string): string {
  return nameKey(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replaceAll("’", "")
    .replaceAll(" ", "-");
}

const compactIcons = new Map<string, ProcessedImage>();

function readCompactIcon(path: string): ProcessedImage {
  const cached = compactIcons.get(path);
  if (cached) return cached;
  const bytes = readFileSync(new URL(`./${path}.webp`, import.meta.url));
  const image = registerArtwork({ full: bytes, thumb: bytes, width: 160, height: 160 });
  compactIcons.set(path, image);
  return image;
}

const cataloguePantryPictures = new Map(
  sources
    .filter((source) => source.type === "pantry")
    .map(
      ({ kind, path, name }) =>
        [
          pantryPictureKey(kind, path, name),
          readCompactIcon(`pantry-icons/${pantryIconSlug(name)}`),
        ] as const,
    ),
);

function utensilPicture(
  kind: UtensilKind,
  name: string,
): readonly [`${UtensilKind}:${string}`, ProcessedImage] {
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

const categories = lines("./categories.txt")
  .slice(1)
  .flatMap((line) => {
    const [kind, parent, children] = line.split("|");
    return (children as string)
      .split(", ")
      .map((child) =>
        catalogueCategorySchema.parse({ kind, path: `${parent}/${child}`.split("/") }),
      );
  });

const categoryPictures = starterCategoryPictures(
  [...categories, ...sources].map(({ path }) => path),
  readCompactIcon,
);
const cocktailPictures = lines("./cocktail-art.txt")
  .slice(1)
  .flatMap((line) => {
    const [path, , , recipeIds] = line.split("|") as [string, string, string, string];
    const picture = readIcon("cocktail-icons", path.slice("cocktail-icons/".length), 768);
    return recipeIds.split(" ").map((id) => [`cocktail:${id}`, picture] as const);
  });

const cataloguePictures = new Map([
  ...utensilPictures,
  ...cataloguePantryPictures,
  ...categoryPictures,
  ...cocktailPictures,
]);

const catalogue: Catalogue = {
  id: "starter-catalogue-v1",
  categories,
  sources,
  recipes,
  glassware,
  tools,
  pictures: cataloguePictures,
};
const optedOut = `${catalogue.id}-opt-out`;
const artworkMigration = "starter-artwork-keys-v1";
const newBarPictures = new Map([...cataloguePictures, ...rootCategoryPictures]);

/** Stage the icons, then create the bar and its full starter catalogue in one transaction. */
export async function addStarterCatalogue(
  ctx: Pick<Ctx, "db" | "storage" | "barId" | "userId">,
  initializeBar: (tx: Tx) => void,
): Promise<void> {
  const { db, barId, userId } = ctx;
  await withCataloguePictures(ctx, newBarPictures, (staged) =>
    db.transaction((tx) => {
      initializeBar(tx);
      const used = applyCatalogue(tx, barId, userId, catalogue, staged);
      tx.insert(barDataMigrations)
        .values([
          { bar_id: barId, migration: rootCategoryCatalogue.id },
          { bar_id: barId, migration: artworkMigration },
        ])
        .run();
      return used;
    }),
  );
}

/** Recognize legacy copies by both file contents. A private upload's name or size is insufficient. */
async function backfillArtworkKeys(
  db: Db,
  storage: ImageStorage,
  barId: string,
  logger: Pick<Logger, "warn">,
): Promise<void> {
  if (db.select().from(barDataMigrations).where(catalogueRecord(barId, artworkMigration)).get())
    return;
  type Match = { id: string; key: string };
  let failed = false;
  async function matchArtwork(image: StoredImage): Promise<Match | null> {
    try {
      const [full, thumb] = await Promise.all([
        storage.get(image.storage_key),
        storage.get(image.thumb_key),
      ]);
      if (!full || !thumb) return null;
      const key = availableArtworkKey(artworkKey(full, thumb));
      return key ? { id: image.id, key } : null;
    } catch (error) {
      failed = true;
      logger.warn("Could not identify legacy artwork", {
        barId,
        imageId: image.id,
        error: String(error),
      });
      return null;
    }
  }
  // Start each read when the async consumer reaches that candidate.
  function* scanArtwork(): Generator<Promise<Match | null>> {
    for (const image of legacyArtworkCandidates(db, barId, bundledArtworkSizes())) {
      yield matchArtwork(image);
    }
  }
  const matches: Match[] = [];
  for await (const match of scanArtwork()) {
    if (match) matches.push(match);
  }
  db.transaction((tx) => {
    for (const { id, key } of matches) setArtworkKey(tx, barId, id, key);
    if (failed) return; // Retry unreadable candidates on a later startup.
    tx.insert(barDataMigrations)
      .values({ bar_id: barId, migration: artworkMigration })
      .onConflictDoNothing()
      .run();
  });
}

export function skipStarterCatalogue(db: Executor, barId: string): void {
  db.insert(barDataMigrations)
    .values({ bar_id: barId, migration: optedOut })
    .onConflictDoNothing()
    .run();
}

/** Imports the starter pack unless the bar opted out. */
export async function seedStarterCatalogue(
  db: Db,
  storage: ImageStorage,
  barId: string,
): Promise<void> {
  if (db.select().from(barDataMigrations).where(catalogueRecord(barId, optedOut)).get()) return;
  await importCatalogue(db, storage, barId, catalogue);
  await importCatalogue(db, storage, barId, rootCategoryCatalogue);
}

/** Backfill existing bars and seed the default bar once it has been created. */
export async function migrateStarterCatalogues(
  db: Db,
  storage: ImageStorage,
  logger: Pick<Logger, "warn"> = createLogger("warn"),
): Promise<void> {
  const allBars = db.select({ id: bars.id }).from(bars).all();
  // Backfill one bar at a time to keep catalogue staging bounded during startup.
  for (const { id } of allBars) {
    await seedStarterCatalogue(db, storage, id); // NOSONAR
    await backfillArtworkKeys(db, storage, id, logger); // NOSONAR
  }
}
