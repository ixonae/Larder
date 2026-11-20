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
    ingredients: ingredient.array(),
    tags: z
      .object({ name: listTagsQuerySchema.shape.q.unwrap() })
      .array()
      .transform((tags) => tags.map(({ name }) => name)),
  });

type EditorInput = z.input<typeof cocktailEditorSchema>;
type EditorOutput = z.output<typeof cocktailEditorSchema>;
export type CocktailForm = UseFormReturn<EditorInput, unknown, EditorOutput>;
export type SourceOption = EditorInput["ingredients"][number]["source"];
export const emptySource: SourceOption = { value: "", name: "" };

export function sourceOption(kind: keyof IngredientSource, id: string, name: string): SourceOption {
  return { value: `${kind}:${id}`, name };
}

type Source = Pick<
  CocktailIngredient,
  "category_id" | "product_id" | "pantry_ingredient_id" | "name" | "note"
>;

function sourceDefaults({ category_id, product_id, pantry_ingredient_id, name, note }: Source) {
  const source = category_id
    ? sourceOption("category_id", category_id, name)
    : product_id
      ? sourceOption("product_id", product_id, name)
      : sourceOption("pantry_ingredient_id", pantry_ingredient_id as string, name);
  return { source, note };
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

export function cocktailDefaults(recipe?: CocktailDetail): EditorInput {
  return {
    name: recipe?.name ?? "",
    description: recipe?.description ?? "",
    method: recipe?.method ?? "shaken",
    ice: recipe?.ice ?? "none",
    servings: recipe?.servings ?? 1,
    glass_id: recipe?.glass_id ?? "",
    garnish: recipe?.garnish ?? "",
    serving_notes: recipe?.serving_notes ?? "",
    source: recipe?.source ?? "",
    notes: recipe?.notes ?? "",
    ingredients:
      recipe?.ingredients.map(
        ({ amount, unit, optional, preparation_only, alternatives, ...line }) => ({
          ...sourceDefaults(line),
          amount,
          unit,
          optional,
          preparation_only,
          alternatives: alternatives.map(sourceDefaults),
        }),
      ) ?? [],
    steps: recipe?.steps.map(({ text }) => ({ text })) ?? [],
    tool_ids: recipe?.tools.map(({ id }) => id) ?? [],
    tags: recipe?.tags.map(({ name }) => ({ name })) ?? [],
  };
}
