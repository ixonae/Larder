import {
  ancestry,
  type BarSummary,
  COCKTAIL_ICE,
  COCKTAIL_METHODS,
  type CocktailDetail,
  hasRole,
  type Utensil,
} from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray } from "react-hook-form";
import { categoryTreeQuery } from "@/api/categories.ts";
import { type CocktailFilters, cocktailQuery, useSaveCocktail } from "@/api/cocktails.ts";
import { utensilOptionsQuery } from "@/api/utensils.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { ImageUpload, useImageField } from "@/components/image-upload.tsx";
import { NativeSelect } from "@/components/native-select.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { bottleCategoryOptions } from "@/features/categories/category-options.tsx";
import { applyServerErrors, FormField, useZodForm } from "@/lib/form.tsx";
import {
  type CocktailForm,
  cocktailDefaults,
  cocktailEditorSchema,
  cocktailPatch,
  type SourceOption,
  sourceOption,
} from "./cocktail-editor-schema.ts";
import { CocktailIngredientsEditor } from "./cocktail-ingredients-editor.tsx";

const newRoute = getRouteApi("/cocktails/new");
const editRoute = getRouteApi("/cocktails/$cocktailId/edit");

export function NewCocktailPage() {
  const search = newRoute.useSearch();
  return (
    <BarGate title="New cocktail">{(bar) => <EditorPage bar={bar} search={search} />}</BarGate>
  );
}

export function EditCocktailPage() {
  const { cocktailId } = editRoute.useParams();
  const search = editRoute.useSearch();
  return (
    <BarGate title="Edit cocktail">
      {(bar) => <EditorPage bar={bar} id={cocktailId} search={search} />}
    </BarGate>
  );
}

function EditorPage({
  bar,
  id,
  search,
}: {
  bar: BarSummary;
  id?: string;
  search: CocktailFilters;
}) {
  return (
    <section className="mx-auto grid max-w-3xl gap-4">
      <h1 className="font-semibold text-2xl">{id ? "Edit cocktail" : "New cocktail"}</h1>
      {hasRole(bar.role, "editor") ? (
        <EditorLoader key={`${bar.id}/${id}`} barId={bar.id} id={id} search={search} />
      ) : (
        <EmptyState title="Editing is unavailable">
          An editor or owner can change recipes.
        </EmptyState>
      )}
    </section>
  );
}

function EditorLoader({
  barId,
  id,
  search,
}: {
  barId: string;
  id: string | undefined;
  search: CocktailFilters;
}) {
  const recipe = useQuery({ ...cocktailQuery(barId, id ?? ""), enabled: id !== undefined });
  const categories = useQuery(categoryTreeQuery(barId));
  const utensils = useQuery(utensilOptionsQuery(barId));
  const queries = [recipe, categories, utensils];
  const failed = queries.find((query) => query.isLoadingError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => failed.refetch()} />;
  if (!categories.data || !utensils.data || (id && !recipe.data)) {
    return <LoadingState label="Loading recipe editor…" />;
  }
  const refreshError = queries.find((query) => query.isRefetchError);
  const options = bottleCategoryOptions(categories.data);
  const byId = new Map(options.map(({ item }) => [item.id, item]));
  const categoryOptions = options.map(({ item }) =>
    sourceOption(
      "category_id",
      item.id,
      ancestry(byId, item.id)
        .reverse()
        .map(({ name }) => name)
        .join(" › "),
    ),
  );
  return (
    <>
      {refreshError && (
        <ErrorState error={refreshError.error} onRetry={() => refreshError.refetch()} />
      )}
      <CocktailFormView
        barId={barId}
        recipe={recipe.data}
        categories={categoryOptions}
        utensils={utensils.data}
        search={search}
      />
    </>
  );
}

function CocktailFormView({
  barId,
  recipe,
  categories,
  utensils,
  search,
}: {
  barId: string;
  recipe: CocktailDetail | undefined;
  categories: SourceOption[];
  utensils: Utensil[];
  search: CocktailFilters;
}) {
  const [defaultValues] = useState(() => cocktailDefaults(recipe));
  const [initial] = useState(() => recipe && cocktailEditorSchema.parse(defaultValues));
  const form = useZodForm(cocktailEditorSchema, { defaultValues });
  const save = useSaveCocktail(barId);
  const picture = useImageField(barId, "cocktails");
  const navigate = useNavigate();
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const detailLocation = (id: string) => ({
    to: "/cocktails/$cocktailId" as const,
    params: { cocktailId: id },
    search,
  });
  const submit = form.handleSubmit(async (json) => {
    try {
      let id: string;
      if (recipe && initial) {
        id = recipe.id;
        const patch = cocktailPatch(initial, json);
        if (Object.keys(patch).length > 0) await save.mutateAsync({ id, json: patch });
      } else {
        const saved = await save.mutateAsync({ json });
        id = saved.id;
      }
      await picture.apply(id, recipe ? "Cocktail saved" : "Cocktail added");
      if (active.current) await navigate(detailLocation(id));
    } catch (err) {
      applyServerErrors(form, err);
      toast("Could not save the cocktail", {
        description: (err as Error).message,
        variant: "error",
      });
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={form.formState.isSubmitting} className="grid min-w-0 gap-5">
        <FormField form={form} name="name" label="Name">
          {(control) => <Input {...control} {...form.register("name")} />}
        </FormField>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FormField form={form} name="method" label="Method">
            {(control) => (
              <NativeSelect {...control} {...form.register("method")}>
                {COCKTAIL_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField form={form} name="ice" label="Ice">
            {(control) => (
              <NativeSelect {...control} {...form.register("ice")}>
                {COCKTAIL_ICE.map((ice) => (
                  <option key={ice} value={ice}>
                    {ice.replaceAll("_", " ")}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField form={form} name="servings" label="Servings">
            {(control) => (
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                {...control}
                {...form.register("servings", { valueAsNumber: true })}
              />
            )}
          </FormField>
          <FormField form={form} name="glass_id" label="Glass">
            {(control) => (
              <NativeSelect className="w-full min-w-0" {...control} {...form.register("glass_id")}>
                <option value="">None</option>
                {utensils
                  .filter(({ kind }) => kind === "glass")
                  .map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
        <CocktailIngredientsEditor form={form} barId={barId} categories={categories} />
        <RecipeLists form={form} utensils={utensils} />
        {(
          [
            ["description", "Description"],
            ["garnish", "Garnish"],
            ["serving_notes", "Serving notes"],
            ["source", "Source"],
            ["notes", "Notes"],
          ] as const
        ).map(([name, label]) => (
          <FormField key={name} form={form} name={name} label={label}>
            {(control) => <Textarea {...control} {...form.register(name)} />}
          </FormField>
        ))}
        <ImageUpload
          imageId={recipe?.image_id ?? null}
          value={picture.change}
          onChange={picture.setChange}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate(recipe ? detailLocation(recipe.id) : { to: "/cocktails", search })
            }
          >
            Cancel
          </Button>
          <Button type="submit">{recipe ? "Save cocktail" : "Add cocktail"}</Button>
        </div>
      </fieldset>
    </form>
  );
}

function RecipeLists({ form, utensils }: { form: CocktailForm; utensils: Utensil[] }) {
  const steps = useFieldArray({ control: form.control, name: "steps" });
  const tags = useFieldArray({ control: form.control, name: "tags" });
  const tools = utensils.filter(({ kind }) => kind === "tool");
  return (
    <>
      <section className="grid gap-3">
        <h2 className="font-semibold">Steps</h2>
        {steps.fields.map(({ id }, index) => (
          <div className="grid gap-2" key={id}>
            <FormField form={form} name={`steps.${index}.text`} label={`Step ${index + 1}`}>
              {(control) => <Textarea {...control} {...form.register(`steps.${index}.text`)} />}
            </FormField>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => steps.remove(index)}
            >
              Remove step
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() => steps.append({ text: "" })}
        >
          Add step
        </Button>
      </section>
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold">Tools</legend>
        {tools.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add tools in Utensils to select them here.
          </p>
        ) : (
          <Controller
            control={form.control}
            name="tool_ids"
            render={({ field }) => (
              <div className="grid gap-2 sm:grid-cols-2">
                {tools.map(({ id, name }) => (
                  <label key={id} className="flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={field.value.includes(id)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.checked
                            ? [...field.value, id]
                            : field.value.filter((value) => value !== id),
                        )
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
            )}
          />
        )}
      </fieldset>
      <section className="grid gap-3">
        <h2 className="font-semibold">Tags</h2>
        {tags.fields.map(({ id }, index) => (
          <div className="grid gap-2" key={id}>
            <FormField form={form} name={`tags.${index}.name`} label={`Tag ${index + 1}`}>
              {(control) => <Input {...control} {...form.register(`tags.${index}.name`)} />}
            </FormField>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => tags.remove(index)}
            >
              Remove tag
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() => tags.append({ name: "" })}
        >
          Add tag
        </Button>
      </section>
    </>
  );
}
