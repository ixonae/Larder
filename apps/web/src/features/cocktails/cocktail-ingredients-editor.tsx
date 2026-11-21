import { cn } from "cn";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import type { ComponentProps } from "react";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { AmountInput } from "@/components/amount-input.tsx";
import { toggleChip } from "@/components/toggle-chip.ts";
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
  const last = ingredients.fields.length - 1;
  return (
    <div className="grid gap-3">
      {ingredients.fields.map(({ id }, index) => (
        <fieldset className="grid min-w-0 gap-3 rounded-lg border bg-background p-3" key={id}>
          <legend className="sr-only">Ingredient {index + 1}</legend>
          <div className="flex items-center justify-between gap-2">
            <span
              className="flex size-6 items-center justify-center rounded-full bg-brand/10 font-medium text-brand text-xs tabular-nums"
              aria-hidden
            >
              {index + 1}
            </span>
            <div className="flex gap-0.5">
              <IconButton
                label="Move up"
                disabled={index === 0}
                onClick={() => ingredients.move(index, index - 1)}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                label="Move down"
                disabled={index === last}
                onClick={() => ingredients.move(index, index + 1)}
              >
                <ArrowDown />
              </IconButton>
              <IconButton label="Remove ingredient" onClick={() => ingredients.remove(index)}>
                <Trash2 />
              </IconButton>
            </div>
          </div>
          {/* biome-ignore lint/suspicious/noArrayIndexKey: Remount the nested field array when its form path changes after a move. */}
          <Ingredient key={`${id}/${index}`} form={form} catalogue={catalogue} index={index} />
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
            preparation_only: false,
            alternatives: [],
          })
        }
      >
        <Plus aria-hidden />
        Add ingredient
      </Button>
    </div>
  );
}

function IconButton({
  label,
  className,
  ...props
}: { label: string } & Omit<ComponentProps<typeof Button>, "aria-label">) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

type IngredientPath = `ingredients.${number}`;
type PreparationPath = IngredientPath | `${IngredientPath}.alternatives.${number}`;

function Ingredient({
  form,
  catalogue,
  index,
}: Readonly<{
  form: CocktailForm;
  catalogue: IngredientCatalogue;
  index: number;
}>) {
  const path = `ingredients.${index}` as const;
  const alternatives = useFieldArray({ control: form.control, name: `${path}.alternatives` });
  const [amount, unit] = useWatch({
    control: form.control,
    name: [`${path}.amount`, `${path}.unit`],
  });
  return (
    <>
      <div className="grid gap-3 @md:grid-cols-[minmax(0,1fr)_minmax(10rem,40%)]">
        <SourceField form={form} catalogue={catalogue} path={path} label="Preferred source" />
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
      </div>
      <NoteField form={form} path={path} />
      <div className="flex flex-wrap gap-2">
        <label className={toggleChip({ size: "sm" })}>
          <input type="checkbox" className="sr-only" {...form.register(`${path}.optional`)} />
          <span>Optional</span>
        </label>
        <label className={toggleChip({ size: "sm" })} title="For example, a glass rinse">
          <input
            type="checkbox"
            className="sr-only"
            {...form.register(`${path}.preparation_only`)}
          />
          <span>Preparation only</span>
        </label>
      </div>
      {alternatives.fields.map(({ id }, alternativeIndex) => {
        const alternative = `${path}.alternatives.${alternativeIndex}` as const;
        return (
          <fieldset key={id} className="grid min-w-0 gap-2 border-brand/30 border-l-2 pl-3">
            <legend className="mb-1 font-medium text-muted-foreground text-xs">
              Alternative {alternativeIndex + 1}
            </legend>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <SourceField
                  form={form}
                  catalogue={catalogue}
                  path={alternative}
                  label="Substitute"
                />
              </div>
              <IconButton
                label="Remove alternative"
                onClick={() => alternatives.remove(alternativeIndex)}
              >
                <X />
              </IconButton>
            </div>
            <NoteField form={form} path={alternative} />
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-self-start text-muted-foreground"
        onClick={() => alternatives.append({ source: emptySource, note: "" })}
      >
        <Plus aria-hidden />
        Add alternative
      </Button>
    </>
  );
}

function SourceField({
  form,
  catalogue,
  path,
  label,
}: Readonly<{
  form: CocktailForm;
  catalogue: IngredientCatalogue;
  path: PreparationPath;
  label: string;
}>) {
  return (
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
  );
}

function NoteField({ form, path }: Readonly<{ form: CocktailForm; path: PreparationPath }>) {
  return (
    <FormField form={form} name={`${path}.note`} label="Preparation note" srOnlyLabel>
      {(control) => (
        <Input
          placeholder="Note, e.g. freshly squeezed"
          {...control}
          {...form.register(`${path}.note`)}
        />
      )}
    </FormField>
  );
}
