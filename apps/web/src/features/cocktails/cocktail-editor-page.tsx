import {
  type BarSummary,
  COCKTAIL_ICE,
  COCKTAIL_METHODS,
  type CocktailDetail,
  hasRole,
  nameKey,
  type Utensil,
} from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Check, Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Controller, useFieldArray } from "react-hook-form";
import { categoryTreeQuery } from "@/api/categories.ts";
import { type CocktailFilters, cocktailQuery, useSaveCocktail } from "@/api/cocktails.ts";
import { utensilOptionsQuery } from "@/api/utensils.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { optionPath } from "@/components/combobox.tsx";
import { ImageUpload, useImageField } from "@/components/image-upload.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { toast } from "@/components/toaster.tsx";
import { toggleChip } from "@/components/toggle-chip.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { bottleCategoryOptions } from "@/features/categories/category-options.tsx";
import { applyServerErrors, ComboboxField, FormField, useZodForm } from "@/lib/form.tsx";
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
      <h1 className="text-3xl">{id ? "Edit cocktail" : "New cocktail"}</h1>
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
  const categoryOptions = bottleCategoryOptions(categories.data).map((option) =>
    sourceOption("category_id", option.value, optionPath(option)),
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

  const glasses = utensils
    .filter(({ kind }) => kind === "glass")
    .map(({ id, name }) => ({ value: id, label: name }));

  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={form.formState.isSubmitting} className="grid min-w-0 gap-4">
        <FormSection title="Basics">
          <FormField form={form} name="name" label="Name">
            {(control) => <Input autoComplete="off" {...control} {...form.register("name")} />}
          </FormField>
          <FormField form={form} name="description" label="Description">
            {(control) => <Textarea rows={2} {...control} {...form.register("description")} />}
          </FormField>
          <ImageUpload
            imageId={recipe?.image_id ?? null}
            value={picture.change}
            onChange={picture.setChange}
          />
        </FormSection>

        <FormSection title="Ingredients">
          <CocktailIngredientsEditor form={form} barId={barId} categories={categories} />
        </FormSection>

        <FormSection title="Preparation">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ComboboxField
              form={form}
              name="method"
              label="Method"
              options={COCKTAIL_METHODS.map((method) => ({ value: method, label: method }))}
            />
            <ComboboxField
              form={form}
              name="ice"
              label="Ice"
              options={COCKTAIL_ICE.map((ice) => ({
                value: ice,
                label: ice.replaceAll("_", " "),
              }))}
            />
            <ComboboxField
              form={form}
              name="glass_id"
              label="Glass"
              options={glasses}
              clearLabel="None"
              searchPlaceholder="Search glasses"
            />
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
          </div>
          <RecipeLists form={form} utensils={utensils} />
        </FormSection>

        <FormSection title="Notes">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["garnish", "Garnish"],
                ["serving_notes", "Serving notes"],
                ["source", "Source"],
                ["notes", "Notes"],
              ] as const
            ).map(([name, label]) => (
              <FormField key={name} form={form} name={name} label={label}>
                {(control) => <Textarea rows={2} {...control} {...form.register(name)} />}
              </FormField>
            ))}
          </div>
        </FormSection>

        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex justify-end gap-2 rounded-xl border bg-background/90 p-2 shadow-lg backdrop-blur md:bottom-4">
          <Button
            type="button"
            variant="ghost"
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

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function RecipeLists({ form, utensils }: { form: CocktailForm; utensils: Utensil[] }) {
  const steps = useFieldArray({ control: form.control, name: "steps" });
  const tools = utensils.filter(({ kind }) => kind === "tool");
  return (
    <>
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium text-sm">Steps</legend>
        <ol className="grid gap-2">
          {steps.fields.map(({ id }, index) => (
            <li className="flex items-start gap-2" key={id}>
              <span
                className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 font-medium text-brand text-xs tabular-nums"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <FormField
                  form={form}
                  name={`steps.${index}.text`}
                  label={`Step ${index + 1}`}
                  srOnlyLabel
                >
                  {(control) => (
                    <Textarea
                      rows={1}
                      className="min-h-9"
                      {...control}
                      {...form.register(`steps.${index}.text`)}
                    />
                  )}
                </FormField>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove step"
                onClick={() => steps.remove(index)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => steps.append({ text: "" })}
        >
          <Plus aria-hidden />
          Add step
        </Button>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium text-sm">Tools</legend>
        {tools.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add tools in Utensils to select them here.
          </p>
        ) : (
          <Controller
            control={form.control}
            name="tool_ids"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {tools.map(({ id, name }) => (
                  <label key={id} className={toggleChip()}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={field.value.includes(id)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.checked
                            ? [...field.value, id]
                            : field.value.filter((value) => value !== id),
                        )
                      }
                    />
                    <Check className="hidden size-3.5 [:checked+&]:block" aria-hidden />
                    {name}
                  </label>
                ))}
              </div>
            )}
          />
        )}
      </fieldset>
      <TagsField form={form} />
    </>
  );
}

function TagsField({ form }: { form: CocktailForm }) {
  const tags = useFieldArray({ control: form.control, name: "tags" });
  const [draft, setDraft] = useState("");
  const errors = form.formState.errors.tags;
  const add = () => {
    const name = draft.trim();
    // Tags are only added and removed here, so `fields` holds every current name.
    if (name && !tags.fields.some((tag) => nameKey(tag.name) === nameKey(name))) {
      tags.append({ name }, { shouldFocus: false });
    }
    setDraft("");
  };
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-medium text-sm">Tags</legend>
      {tags.fields.length > 0 && (
        <ul aria-label="Tags" className="flex flex-wrap gap-2">
          {tags.fields.map(({ id, name }, index) => {
            return (
              <li
                key={id}
                className="flex h-8 items-center gap-1 rounded-full bg-secondary pr-1 pl-3 text-sm"
              >
                {name}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="rounded-full"
                  aria-label={`Remove tag ${name}`}
                  onClick={() => tags.remove(index)}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {tags.fields.map(({ id, name }, index) => {
        const message = errors?.[index]?.name?.message;
        return (
          message && (
            <p key={id} className="text-destructive text-sm">
              {name}: {message}
            </p>
          )
        );
      })}
      <div className="flex gap-2">
        <Input
          aria-label="New tag"
          placeholder="Add a tag, then press Enter"
          className="max-w-72"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            add();
          }}
        />
        <Button type="button" variant="outline" disabled={!draft.trim()} onClick={add}>
          Add tag
        </Button>
      </div>
    </fieldset>
  );
}
