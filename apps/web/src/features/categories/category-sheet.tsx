import {
  CATEGORY_KIND_LABEL,
  CATEGORY_KINDS,
  type Category,
  type CategoryTreeNode,
  createCategorySchema,
  flattenTree,
  hasInStock,
  subtreeIds,
} from "@larder/shared";
import { useMemo } from "react";
import { useCategoryMutations } from "@/api/categories.ts";
import { NativeSelect } from "@/components/native-select.tsx";
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
import {
  applyServerErrors,
  emptyToNull,
  emptyToNullNumber,
  emptyToUndefined,
  FormField,
  useZodForm,
} from "@/lib/form.tsx";
import { CategoryOptions } from "./category-options.tsx";

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
}: {
  barId: string;
  tree: CategoryTreeNode[];
  target: SheetTarget | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
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
}: {
  barId: string;
  tree: CategoryTreeNode[];
  target: SheetTarget;
  onDone: () => void;
}) {
  const { create, update } = useCategoryMutations(barId);
  const all = useMemo(() => flattenTree(tree), [tree]);
  // A category cannot move under itself or one of its sub-categories.
  const parentOptions = useMemo(() => {
    if (!editing) return all;
    const excluded = subtreeIds(
      all.map((a) => a.item),
      editing.id,
    );
    return all.filter((a) => !excluded.has(a.item.id));
  }, [all, editing]);

  const form = useZodForm(createCategorySchema, {
    defaultValues: {
      name: editing?.name ?? "",
      parent_id: editing ? editing.parent_id : parentId,
      kind: editing?.kind,
      default_abv: editing?.default_abv ?? null,
      description: editing?.description ?? "",
      always_available: editing?.always_available ?? false,
      in_stock: editing?.in_stock ?? false,
    },
  });
  const parent = all.find((a) => a.item.id === form.watch("parent_id"))?.item;
  const kind = form.watch("kind") ?? parent?.kind;
  const showInStock = kind !== undefined && hasInStock(kind);

  const submit = form.handleSubmit(async ({ in_stock, ...values }) => {
    if (!kind) {
      form.setError("kind", { message: "Pick a kind for a top-level category" });
      return;
    }
    const json = { ...values, ...(showInStock && { in_stock }) };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, json });
      else await create.mutateAsync(json);
      toast(editing ? "Category saved" : "Category created");
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
        {(control) => <Input autoComplete="off" {...control} {...form.register("name")} />}
      </FormField>

      <FormField form={form} name="parent_id" label="Parent">
        {(control) => (
          <NativeSelect {...control} {...form.register("parent_id", { setValueAs: emptyToNull })}>
            <option value="">None (top level)</option>
            <CategoryOptions items={parentOptions} />
          </NativeSelect>
        )}
      </FormField>

      <FormField form={form} name="kind" label="Kind">
        {(control) => (
          <NativeSelect {...control} {...form.register("kind", { setValueAs: emptyToUndefined })}>
            {!editing && (
              <option value="">
                {parent ? `Same as parent (${CATEGORY_KIND_LABEL[parent.kind]})` : "Choose…"}
              </option>
            )}
            {CATEGORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>

      <FormField
        form={form}
        name="default_abv"
        label="Default ABV (%)"
        hint="Used when a recipe names the category rather than a bottle."
      >
        {(control) => (
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

      <FormField form={form} name="description" label="Description">
        {(control) => <Textarea rows={3} {...control} {...form.register("description")} />}
      </FormField>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...form.register("always_available")} />
        Always available (water, sugar, ice…)
      </label>
      {showInStock && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...form.register("in_stock")} />
          In stock now
        </label>
      )}

      <SheetFooter className="px-0">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {editing ? "Save" : "Create"}
        </Button>
      </SheetFooter>
    </form>
  );
}
