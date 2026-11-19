import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { AmountInput } from "@/components/amount-input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { FormField } from "@/lib/form.tsx";
import { type CocktailForm, emptySource, type SourceOption } from "./cocktail-editor-schema.ts";
import { IngredientSourcePicker } from "./ingredient-source-picker.tsx";

interface IngredientCatalogue {
  barId: string;
  categories: SourceOption[];
}

export function CocktailIngredientsEditor({
  form,
  ...catalogue
}: { form: CocktailForm } & IngredientCatalogue) {
  const ingredients = useFieldArray({ control: form.control, name: "ingredients" });
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">Ingredients</h2>
      {ingredients.fields.map(({ id }, index) => (
        <fieldset className="grid min-w-0 gap-3 rounded-lg border p-3" key={id}>
          <legend className="px-1 font-medium text-sm">Ingredient {index + 1}</legend>
          {/* biome-ignore lint/suspicious/noArrayIndexKey: Remount the nested field array when its form path changes after a move. */}
          <Ingredient key={`${id}/${index}`} form={form} catalogue={catalogue} index={index} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => ingredients.move(index, index - 1)}
            >
              Move up
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === ingredients.fields.length - 1}
              onClick={() => ingredients.move(index, index + 1)}
            >
              Move down
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => ingredients.remove(index)}
            >
              Remove ingredient
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        onClick={() =>
          ingredients.append({
            source: emptySource,
            note: "",
            amount: null,
            unit: "ml",
            optional: false,
            alternatives: [],
          })
        }
      >
        Add ingredient
      </Button>
    </section>
  );
}

type IngredientPath = `ingredients.${number}`;
type PreparationPath = IngredientPath | `${IngredientPath}.alternatives.${number}`;

function Ingredient({
  form,
  catalogue,
  index,
}: {
  form: CocktailForm;
  catalogue: IngredientCatalogue;
  index: number;
}) {
  const path = `ingredients.${index}` as const;
  const alternatives = useFieldArray({ control: form.control, name: `${path}.alternatives` });
  const [amount, unit] = useWatch({
    control: form.control,
    name: [`${path}.amount`, `${path}.unit`],
  });
  return (
    <>
      <Preparation form={form} catalogue={catalogue} path={path} label="Preferred source" />
      <FormField form={form} name={`${path}.amount`} label="Quantity">
        {(control) => (
          <AmountInput
            {...control}
            value={{ amount, unit }}
            onChange={(value) => {
              form.setValue(`${path}.unit`, value.unit);
              form.setValue(`${path}.amount`, value.amount, {
                shouldValidate: form.formState.isSubmitted,
              });
            }}
          />
        )}
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...form.register(`${path}.optional`)} />
        Optional
      </label>
      {alternatives.fields.map(({ id }, alternativeIndex) => (
        <fieldset key={id} className="grid min-w-0 gap-3 rounded-md border p-3">
          <legend className="px-1 text-sm">Alternative {alternativeIndex + 1}</legend>
          <Preparation
            form={form}
            catalogue={catalogue}
            path={`${path}.alternatives.${alternativeIndex}`}
            label="Substitute"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => alternatives.remove(alternativeIndex)}
          >
            Remove alternative
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => alternatives.append({ source: emptySource, note: "" })}
      >
        Add alternative
      </Button>
    </>
  );
}

function Preparation({
  form,
  catalogue,
  path,
  label,
}: {
  form: CocktailForm;
  catalogue: IngredientCatalogue;
  path: PreparationPath;
  label: string;
}) {
  return (
    <>
      <FormField form={form} name={`${path}.source`} label={label}>
        {(control) => (
          <Controller
            control={form.control}
            name={`${path}.source`}
            render={({ field }) => (
              <IngredientSourcePicker {...catalogue} {...control} field={field} />
            )}
          />
        )}
      </FormField>
      <FormField form={form} name={`${path}.note`} label="Preparation note">
        {(control) => <Input {...control} {...form.register(`${path}.note`)} />}
      </FormField>
    </>
  );
}
