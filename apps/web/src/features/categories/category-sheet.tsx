import {
  CATEGORY_KIND_LABEL,
  CATEGORY_KINDS,
  type Category,
  type CategoryTreeNode,
  createCategorySchema,
  flattenTree,
  subtreeIds,
} from "@larder/shared";
import { type JSX, useId, useMemo } from "react";
import { useCategoryMutations } from "@/api/categories.ts";
import { ImageUpload, useImageField } from "@/components/image-upload.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { onClosed } from "@/lib/dialog.ts";
import {
  applyServerErrors,
  ComboboxField,
  type ControlProps,
  emptyToNullNumber,
  FormField,
  useZodForm,
} from "@/lib/form.tsx";
import { categoryOptions } from "./category-options.tsx";

export interface SheetTarget {
  /** The category being edited, or null to create one. */
  editing: Category | null;
  /** Parent preselected when creating. */
  parentId: string | null;
}

/** Create/edit form for a category, in a sheet (full width on phones). */
export function CategorySheet({
  barId,
  tree,
  target,
  onClose,
}: Readonly<{
  barId: string;
  tree: CategoryTreeNode[];
  target: SheetTarget | null;
  onClose: () => void;
}>): JSX.Element {
  return (
    <Sheet open={target !== null} onOpenChange={onClosed(onClose)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {target?.editing ? `Edit ${target.editing.name}` : "New category"}
          </SheetTitle>
          <SheetDescription>Categories group bottles and recipe ingredients.</SheetDescription>
        </SheetHeader>
        {target && <CategoryForm barId={barId} tree={tree} target={target} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function CategoryForm({
  barId,
  tree,
  target: { editing, parentId },
  onDone,
}: Readonly<{
  barId: string;
  tree: CategoryTreeNode[];
  target: SheetTarget;
  onDone: () => void;
}>): JSX.Element {
  const { create, update } = useCategoryMutations(barId);
  const picture = useImageField(barId, "categories");
  const availabilityHint = useId();
  const all = useMemo(() => flattenTree(tree), [tree]);
  // A category cannot move under itself or one of its sub-categories.
  const parentOptions = useMemo(() => {
    const excluded = editing
      ? subtreeIds(
          all.map((a) => a.item),
          editing.id,
        )
      : new Set<string>();
    return categoryOptions(tree, (item) => !excluded.has(item.id));
  }, [tree, all, editing]);

  const form = useZodForm(createCategorySchema, {
    defaultValues: {
      name: editing?.name ?? "",
      parent_id: editing ? editing.parent_id : parentId,
      kind: editing?.kind,
      default_abv: editing?.default_abv ?? null,
      always_available: editing?.always_available ?? false,
      description: editing?.description ?? "",
    },
  });
  const parent = all.find((a) => a.item.id === form.watch("parent_id"))?.item;
  const kind = form.watch("kind") ?? parent?.kind;

  const submit = form.handleSubmit(async (json) => {
    if (!kind) {
      form.setError("kind", { message: "Pick a kind for a top-level category" });
      return;
    }
    try {
      const saved = editing
        ? await update.mutateAsync({ id: editing.id, json })
        : await create.mutateAsync(json);
      await picture.apply(saved.id, editing ? "Category saved" : "Category created");
      onDone();
    } catch (err) {
      if (applyServerErrors(form, err)) return;
      toast("Could not save the category", {
        description: (err as Error).message,
        variant: "error",
      });
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-4" noValidate>
      <FormField form={form} name="name" label="Name">
        {(control: ControlProps): JSX.Element => (
          <Input autoComplete="off" {...control} {...form.register("name")} />
        )}
      </FormField>

      <ComboboxField
        form={form}
        name="parent_id"
        label="Parent"
        toValue={(value: string): string | null => value || null}
        options={parentOptions}
        clearLabel="None (top level)"
        searchPlaceholder="Search categories"
      />

      <ComboboxField
        form={form}
        name="kind"
        label="Kind"
        toValue={(value: string): string | undefined => value || undefined}
        options={CATEGORY_KINDS.map((k) => ({ value: k, label: CATEGORY_KIND_LABEL[k] }))}
        clearLabel={
          editing || !parent ? undefined : `Same as parent (${CATEGORY_KIND_LABEL[parent.kind]})`
        }
      />

      <FormField
        form={form}
        name="default_abv"
        label="Default ABV (%)"
        hint="Used when a recipe names the category rather than a bottle."
      >
        {(control: ControlProps): JSX.Element => (
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            {...control}
            {...form.register("default_abv", { setValueAs: emptyToNullNumber })}
          />
        )}
      </FormField>

      <div className="grid gap-1.5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            aria-describedby={availabilityHint}
            {...form.register("always_available")}
          />
          <span>Always available</span>
        </label>
        <p id={availabilityHint} className="text-muted-foreground text-xs">
          Counts as in stock for recipes that call for this category or one of its parents, even
          without a bottle entry.
        </p>
      </div>

      <FormField form={form} name="description" label="Description">
        {(control: ControlProps): JSX.Element => (
          <Textarea rows={3} {...control} {...form.register("description")} />
        )}
      </FormField>

      <ImageUpload
        imageId={editing?.image_id ?? null}
        value={picture.change}
        onChange={picture.setChange}
      />

      <SheetFooter className="px-0">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {editing ? "Save" : "Create"}
        </Button>
      </SheetFooter>
    </form>
  );
}
