import {
  type CategoryTreeNode,
  createPantryIngredientSchema,
  flattenTree,
  isPantryCategoryKind,
  isPantryRoot,
  type PantryIngredient,
} from "@larder/shared";
import { useMemo } from "react";
import { usePantryMutations } from "@/api/pantry.ts";
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
import {
  CategoryOptions,
  CategoryTreeLoader,
  categoryIdField,
} from "@/features/categories/category-options.tsx";
import { applyServerErrors, FormField, useZodForm } from "@/lib/form.tsx";

/** What the sheet is open for: the ingredient being edited, `"new"` to add one, or null when closed. */
export type IngredientTarget = PantryIngredient | "new" | null;

/** Create/edit form for a pantry ingredient, in a sheet (full width on phones). */
export function IngredientSheet({
  barId,
  target,
  onClose,
}: {
  barId: string;
  target: IngredientTarget;
  onClose: () => void;
}) {
  const editing = target === "new" ? null : target;
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? `Edit ${editing.name}` : "New ingredient"}</SheetTitle>
          <SheetDescription>Track fruit, syrups, garnishes and other ingredients.</SheetDescription>
        </SheetHeader>
        {target && (
          <CategoryTreeLoader barId={barId}>
            {(tree) => (
              <IngredientForm barId={barId} editing={editing} onDone={onClose} tree={tree} />
            )}
          </CategoryTreeLoader>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** The API schema, with a message for the empty "Choose…" option of the category picker. */
const formSchema = createPantryIngredientSchema.extend({ category_id: categoryIdField });

interface FormProps {
  barId: string;
  editing: PantryIngredient | null;
  onDone: () => void;
}

function IngredientForm({
  barId,
  editing,
  onDone,
  tree,
}: FormProps & { tree: CategoryTreeNode[] }) {
  const { create, update } = usePantryMutations(barId);
  const currentCategoryId = editing?.category_id;
  const categories = useMemo(
    () =>
      flattenTree(tree).filter(
        ({ item }) => isPantryCategoryKind(item.kind) || item.id === currentCategoryId,
      ),
    [tree, currentCategoryId],
  );
  // New ingredients go under the starter Pantry grouping when the bar still has it.
  const pantry = categories.find(({ item }) => isPantryRoot(item));

  const form = useZodForm(formSchema, {
    defaultValues: {
      name: editing?.name ?? "",
      category_id: editing?.category_id ?? pantry?.item.id ?? "",
      in_stock: editing?.in_stock ?? true,
      always_available: editing?.always_available ?? false,
    },
  });

  const submit = form.handleSubmit(async (json) => {
    try {
      if (editing) await update.mutateAsync({ id: editing.id, json });
      else await create.mutateAsync(json);
      toast(editing ? "Ingredient saved" : "Ingredient added");
      onDone();
    } catch (err) {
      if (applyServerErrors(form, err)) return;
      toast("Could not save the ingredient", {
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

      <FormField form={form} name="category_id" label="Category">
        {(control) => (
          <NativeSelect {...control} {...form.register("category_id")}>
            <option value="">Choose…</option>
            <CategoryOptions items={categories} />
          </NativeSelect>
        )}
      </FormField>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...form.register("in_stock")} />
        In stock now
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...form.register("always_available")} />
        Always available (a staple such as water or ice)
      </label>

      <SheetFooter className="px-0">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {editing ? "Save" : "Add"}
        </Button>
      </SheetFooter>
    </form>
  );
}
