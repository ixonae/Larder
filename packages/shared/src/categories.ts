import { z } from "zod";
import { idSchema } from "./id.ts";
import { paginationQuerySchema } from "./pagination.ts";
import { optionalText } from "./text.ts";
import { ancestry, type TreeNode } from "./tree.ts";

export const CATEGORY_KINDS = [
  "spirit",
  "liqueur",
  "wine",
  "beer",
  "mixer",
  "juice",
  "syrup",
  "bitters",
  "garnish",
  "other",
] as const;
export const categoryKindSchema = z.enum(CATEGORY_KINDS);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

/** The kinds the cocktail list's "alcohol" filter looks through. */
export const ALCOHOL_KINDS: ReadonlySet<CategoryKind> = new Set([
  "spirit",
  "liqueur",
  "wine",
  "beer",
]);
/** The kinds its "mixer" filter looks through. */
export const MIXER_KINDS: ReadonlySet<CategoryKind> = new Set([
  "mixer",
  "juice",
  "syrup",
  "bitters",
]);

const PANTRY_KINDS: ReadonlySet<CategoryKind> = new Set(["other", "garnish", "syrup"]);

export function isPantryCategoryKind(kind: CategoryKind): boolean {
  return PANTRY_KINDS.has(kind);
}

export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  spirit: "Spirit",
  liqueur: "Liqueur",
  wine: "Wine",
  beer: "Beer",
  mixer: "Mixer",
  juice: "Juice",
  syrup: "Syrup",
  bitters: "Bitters",
  garnish: "Garnish",
  other: "Other",
};

/** The starter category that groups kitchen supplies; new pantry ingredients default to it. */
export const PANTRY_CATEGORY_NAME = "Pantry";

export function isPantryRoot(category: Pick<Category, "parent_id" | "name">): boolean {
  return (
    category.parent_id === null &&
    category.name.toLowerCase() === PANTRY_CATEGORY_NAME.toLowerCase()
  );
}

type CategoryLocation = Pick<Category, "id" | "parent_id" | "name" | "kind">;

export function isBottleCategory(
  category: CategoryLocation,
  byId: Pick<ReadonlyMap<string, CategoryLocation>, "get">,
): boolean {
  return (
    category.kind !== "syrup" &&
    category.kind !== "garnish" &&
    !ancestry(byId, category.id).some(isPantryRoot)
  );
}

export const CATEGORY_NAME_MAX = 100;
export const DESCRIPTION_MAX = 2000;

export const categorySchema = z.object({
  id: idSchema,
  name: z.string(),
  parent_id: idSchema.nullable(),
  kind: categoryKindSchema,
  /** Percent, 0–100. */
  default_abv: z.number().nullable(),
  description: z.string().nullable(),
  /** The picture (`imageUrl(image_id)`), set through `PUT /:id/image`. */
  image_id: idSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Category = z.infer<typeof categorySchema>;
export type CategoryTreeNode = TreeNode<Category>;

export const categoryTreeNodeSchema: z.ZodType<CategoryTreeNode> = categorySchema.extend({
  get children(): z.ZodArray<typeof categoryTreeNodeSchema> {
    return z.array(categoryTreeNodeSchema);
  },
});

/** `GET /categories/tree` */
export const categoryTreeSchema = z.object({ items: z.array(categoryTreeNodeSchema) });
export type CategoryTree = z.infer<typeof categoryTreeSchema>;

const fields = z.object({
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
  /** `null` makes it a root category. */
  parent_id: idSchema.nullable(),
  /** Defaults to the parent's kind; required for a root category. */
  kind: categoryKindSchema,
  default_abv: z.number().min(0).max(100).nullable(),
  /** Blank text is stored as `null`. */
  description: optionalText(DESCRIPTION_MAX),
});

/** `POST /categories` */
export const createCategorySchema = fields.partial().required({ name: true });
export type CreateCategory = z.infer<typeof createCategorySchema>;

/** `PATCH /categories/:id`: only the fields sent change. */
export const updateCategorySchema = fields
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to change");
export type UpdateCategory = z.infer<typeof updateCategorySchema>;

/** `GET /categories`: a page of the flat list, sorted by name. */
export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  /** Matches anywhere in the name, ignoring case. */
  q: z.string().trim().min(1).max(CATEGORY_NAME_MAX).optional(),
  kind: categoryKindSchema.optional(),
  parent_id: idSchema.optional(),
});
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
