import {
  type CocktailDetail,
  type CocktailIngredient,
  cocktailIngredientInputSchema,
  createCocktailSchema,
  type IngredientSource,
  idSchema,
  ingredientSourceSchema,
  listTagsQuerySchema,
  unitSchema,
} from "@larder/shared";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

const text = createCocktailSchema.shape.notes.unwrap();
const source = z
  .object({ value: z.string(), name: z.string() })
  .transform(({ value }) => value)
  .pipe(
    z
      .string()
      .min(1, "Choose an ingredient source")
      .transform((value): Record<string, string | null | undefined> => {
        const [kind, id] = value.split(":");
        return { [kind as string]: id };
      })
      .pipe(ingredientSourceSchema),
  );

const preparation = z.object({ source, note: text }).transform(({ source, note }) => ({
  ...source,
  note,
}));
const ingredient = z
  .object({
    source,
    note: text,
    amount: z.number().nullable(),
    unit: unitSchema,
    optional: z.boolean(),
    preparation_only: z.boolean(),
    alternatives: preparation.array(),
  })
  .transform(
    ({ source, ...line }): z.input<typeof cocktailIngredientInputSchema> => ({
      ...source,
      ...line,
    }),
  )
  .pipe(cocktailIngredientInputSchema);

export const cocktailEditorSchema = createCocktailSchema
  .required({
    ingredients: true,
    steps: true,
    tool_ids: true,
    tags: true,
  })
  .extend({
    glass_id: idSchema.or(z.literal("")).transform((value) => value || null),
    variant_of_id: idSchema.or(z.literal("")).transform((value) => value || null),
    ingredients: ingredient.array(),
    tags: z
      .object({ name: listTagsQuerySchema.shape.q.unwrap() })
      .array()
      .transform((tags) => tags.map(({ name }) => name)),
  });

export type CocktailEditorInput = z.input<typeof cocktailEditorSchema>;
type EditorOutput = z.output<typeof cocktailEditorSchema>;
export type CocktailForm = UseFormReturn<CocktailEditorInput, unknown, EditorOutput>;
export type SourceOption = CocktailEditorInput["ingredients"][number]["source"];
export const emptySource: SourceOption = { value: "", name: "" };

export function sourceOption(kind: keyof IngredientSource, id: string, name: string): SourceOption {
  return { value: `${kind}:${id}`, name };
}

type Source = Pick<
  CocktailIngredient,
  "category_id" | "product_id" | "pantry_ingredient_id" | "name" | "note"
>;

function sourceDefaults({ category_id, product_id, pantry_ingredient_id, name, note }: Source): {
  source: SourceOption;
  note: string | null;
} {
  if (category_id) return { source: sourceOption("category_id", category_id, name), note };
  if (product_id) return { source: sourceOption("product_id", product_id, name), note };
  return {
    source: sourceOption("pantry_ingredient_id", pantry_ingredient_id as string, name),
    note,
  };
}

/** Recipe lists are replaced wholesale by the API, so omit every unchanged list and field. */
export function cocktailPatch(
  initial: EditorOutput,
  submitted: EditorOutput,
): Partial<EditorOutput> {
  const keys = Object.keys(submitted) as (keyof EditorOutput)[];
  return Object.fromEntries(
    keys
      .filter((key) => JSON.stringify(initial[key]) !== JSON.stringify(submitted[key]))
      .map((key) => [key, submitted[key]]),
  );
}

export function cocktailDefaults(
  recipe?: CocktailDetail,
  base?: CocktailDetail,
): CocktailEditorInput {
  const template = recipe ?? base;
  return {
    name: recipe?.name ?? "",
    description: template?.description ?? "",
    method: template?.method ?? "shaken",
    ice: template?.ice ?? "none",
    servings: template?.servings ?? 1,
    glass_id: template?.glass_id ?? "",
    garnish: template?.garnish ?? "",
    serving_notes: template?.serving_notes ?? "",
    source: template?.source ?? "",
    notes: template?.notes ?? "",
    variant_of_id: base?.id ?? recipe?.variant_of_id ?? "",
    variant_note: recipe?.variant_note ?? "",
    ingredients:
      template?.ingredients.map(
        ({ amount, unit, optional, preparation_only, alternatives, ...line }) => ({
          ...sourceDefaults(line),
          amount,
          unit,
          optional,
          preparation_only,
          alternatives: alternatives.map(sourceDefaults),
        }),
      ) ?? [],
    steps: template?.steps.map(({ text }) => ({ text })) ?? [],
    tool_ids: template?.tools.map(({ id }) => id) ?? [],
    tags: template?.tags.map(({ name }) => ({ name })) ?? [],
  };
}
