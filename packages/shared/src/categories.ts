import { z } from "zod";
import { idSchema } from "./id.ts";
import { paginationQuerySchema } from "./pagination.ts";
import type { TreeNode } from "./tree.ts";

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

/** Kinds with a quick present/absent toggle (`in_stock`): fresh or homemade things without a bottle. */
export const IN_STOCK_KINDS = [
  "mixer",
  "juice",
  "syrup",
  "garnish",
] as const satisfies readonly CategoryKind[];

export function hasInStock(kind: CategoryKind): boolean {
  return (IN_STOCK_KINDS as readonly CategoryKind[]).includes(kind);
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
  /** Pantry staples (water, sugar, ice) that are always there. */
  always_available: z.boolean(),
  /** Present/absent toggle; `null` for kinds outside `IN_STOCK_KINDS`. */
  in_stock: z.boolean().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Category = z.infer<typeof categorySchema>;
export type CategoryTreeNode = TreeNode<Category>;

export const categoryTreeNodeSchema: z.ZodType<CategoryTreeNode> = categorySchema.extend({
  get children() {
    return z.array(categoryTreeNodeSchema);
  },
});

/** `GET /categories/tree` */
export const categoryTreeSchema = z.object({ items: z.array(categoryTreeNodeSchema) });
export type CategoryTree = z.infer<typeof categoryTreeSchema>;

const fields = {
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
  /** `null` makes it a root category. */
  parent_id: idSchema.nullable(),
  /** Defaults to the parent's kind; required for a root category. */
  kind: categoryKindSchema,
  default_abv: z.number().min(0).max(100).nullable(),
  /** Blank text is stored as `null`. */
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX)
    .transform((s) => s || null)
    .nullable(),
  always_available: z.boolean(),
  /** Only for kinds in `IN_STOCK_KINDS`; defaults to `false` for them. */
  in_stock: z.boolean(),
};

/** `POST /categories` */
export const createCategorySchema = z.object(fields).partial().required({ name: true });
export type CreateCategory = z.infer<typeof createCategorySchema>;

/** `PATCH /categories/:id`: only the fields sent change. */
export const updateCategorySchema = z
  .object(fields)
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
