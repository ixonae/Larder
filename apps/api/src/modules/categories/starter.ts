import { type CategoryKind, hasInStock, newId } from "@larder/shared";
import type { Executor } from "../../db/client.ts";
import { insertCategories, type NewCategory } from "./repo.ts";

interface StarterCategory {
  name: string;
  /** Required on roots; children take their parent's kind, as in `createCategory`. */
  kind?: CategoryKind;
  abv?: number;
  always?: boolean;
  children?: StarterCategory[];
}

const leaves = (abv: number | undefined, names: string[]): StarterCategory[] =>
  names.map((name) => (abv === undefined ? { name } : { name, abv }));

/** The tree every new bar starts with. Default ABVs are typical values, in percent. */
export const STARTER_CATEGORIES: StarterCategory[] = [
  {
    name: "Spirit",
    kind: "spirit",
    abv: 40,
    children: [
      ...leaves(40, ["Vodka", "Gin", "Tequila", "Mezcal", "Pisco"]),
      { name: "Rum", abv: 40, children: leaves(40, ["White rum", "Aged rum"]) },
      {
        name: "Whisky",
        abv: 40,
        children: leaves(43, ["Scotch", "Bourbon", "Rye", "Irish whiskey", "Japanese whisky"]),
      },
      { name: "Brandy", abv: 40, children: leaves(40, ["Cognac", "Calvados"]) },
    ],
  },
  {
    name: "Liqueur",
    kind: "liqueur",
    abv: 25,
    children: [
      { name: "Orange liqueur", abv: 40 },
      { name: "Coffee liqueur", abv: 20 },
      { name: "Maraschino", abv: 32 },
      { name: "Amaro", abv: 28 },
    ],
  },
  {
    name: "Wine",
    kind: "wine",
    abv: 12,
    children: [
      ...leaves(12, ["Red wine", "White wine", "Sparkling wine"]),
      { name: "Vermouth", abv: 16, children: leaves(17, ["Sweet vermouth", "Dry vermouth"]) },
    ],
  },
  { name: "Beer", kind: "beer", abv: 5 },
  {
    name: "Bitters",
    kind: "bitters",
    abv: 44,
    children: leaves(44, ["Aromatic bitters", "Orange bitters"]),
  },
  {
    name: "Syrup",
    kind: "syrup",
    abv: 0,
    children: leaves(0, ["Simple syrup", "Honey syrup", "Grenadine"]),
  },
  {
    name: "Juice",
    kind: "juice",
    abv: 0,
    children: leaves(0, ["Lime juice", "Lemon juice", "Orange juice"]),
  },
  {
    name: "Mixer",
    kind: "mixer",
    abv: 0,
    children: leaves(0, ["Soda water", "Tonic water", "Ginger beer", "Cola"]),
  },
  {
    name: "Garnish",
    kind: "garnish",
    children: leaves(undefined, ["Lime", "Lemon", "Orange", "Mint"]),
  },
  {
    name: "Pantry",
    kind: "other",
    children: [
      { name: "Ice", always: true },
      { name: "Water", abv: 0, always: true },
      { name: "Sugar", always: true },
    ],
  },
];

/** Inserts the starter tree into a new bar. Call inside the transaction that creates the bar. */
export function seedStarterCategories(db: Executor, barId: string, userId: string): void {
  const rows: NewCategory[] = [];
  const visit = (nodes: StarterCategory[], parentId: string | null, parentKind: CategoryKind) => {
    for (const node of nodes) {
      const id = newId();
      const kind = node.kind ?? parentKind;
      rows.push({
        id,
        bar_id: barId,
        created_by: userId,
        parent_id: parentId,
        name: node.name,
        kind,
        default_abv: node.abv ?? null,
        always_available: node.always ?? false,
        in_stock: hasInStock(kind) ? false : null,
      });
      visit(node.children ?? [], id, kind);
    }
  };
  // Every root names its kind; "other" is only the type-level fallback.
  visit(STARTER_CATEGORIES, null, "other");
  insertCategories(db, rows);
}
