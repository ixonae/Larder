import { type CategoryTreeNode, createProductSchema, type Product } from "@larder/shared";
import { useMemo } from "react";
import { useProductMutations } from "@/api/products.ts";
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
import {
  bottleCategoryOptions,
  CategoryTreeLoader,
  categoryIdField,
} from "@/features/categories/category-options.tsx";
import {
  applyServerErrors,
  ComboboxField,
  emptyToNullNumber,
  FormField,
  useZodForm,
} from "@/lib/form.tsx";

/** What the sheet is open for: the bottle being edited, `"new"` to add one, or null when closed. */
export type ProductTarget = Product | "new" | null;

/** Create/edit form for a bottle, in a sheet (full width on phones). */
export function ProductSheet({
  barId,
  target,
  onClose,
}: {
  barId: string;
  target: ProductTarget;
  onClose: () => void;
}) {
  const editing = target === "new" ? null : target;
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? `Edit ${editing.name}` : "New bottle"}</SheetTitle>
          <SheetDescription>A bottle you own or have tasted.</SheetDescription>
        </SheetHeader>
        {target && (
          <CategoryTreeLoader barId={barId}>
            {(tree) => <ProductForm barId={barId} editing={editing} onDone={onClose} tree={tree} />}
          </CategoryTreeLoader>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** The API schema, with a message for the empty "Choose…" option of the category picker. */
const formSchema = createProductSchema.extend({ category_id: categoryIdField });

interface FormProps {
  barId: string;
  editing: Product | null;
  onDone: () => void;
}

function ProductForm({ barId, editing, onDone, tree }: FormProps & { tree: CategoryTreeNode[] }) {
  const { create, update } = useProductMutations(barId);
  const picture = useImageField(barId, "products");
  const currentCategoryId = editing?.category_id;
  const categories = useMemo(
    () => bottleCategoryOptions(tree, currentCategoryId),
    [tree, currentCategoryId],
  );

  const form = useZodForm(formSchema, {
    defaultValues: {
      name: editing?.name ?? "",
      category_id: editing?.category_id ?? "",
      producer: editing?.producer ?? "",
      country: editing?.country ?? "",
      region: editing?.region ?? "",
      abv: editing?.abv ?? null,
      vintage: editing?.vintage ?? null,
      age_years: editing?.age_years ?? null,
      description: editing?.description ?? "",
      in_bar: editing?.in_bar ?? true,
    },
  });

  const submit = form.handleSubmit(async (json) => {
    try {
      const saved = editing
        ? await update.mutateAsync({ id: editing.id, json })
        : await create.mutateAsync(json);
      await picture.apply(saved.id, editing ? "Bottle saved" : "Bottle added");
      onDone();
    } catch (err) {
      if (applyServerErrors(form, err)) return;
      toast("Could not save the bottle", { description: (err as Error).message, variant: "error" });
    }
  });

  const text = (name: "name" | "producer" | "country" | "region", label: string) => (
    <FormField form={form} name={name} label={label}>
      {(control) => <Input autoComplete="off" {...control} {...form.register(name)} />}
    </FormField>
  );
  const number = (name: "abv" | "vintage" | "age_years", label: string) => (
    <FormField form={form} name={name} label={label}>
      {(control) => (
        <Input
          type="number"
          inputMode={name === "abv" ? "decimal" : "numeric"}
          step={name === "abv" ? "any" : undefined}
          {...control}
          {...form.register(name, { setValueAs: emptyToNullNumber })}
        />
      )}
    </FormField>
  );

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-4" noValidate>
      {text("name", "Name")}

      <ComboboxField
        form={form}
        name="category_id"
        label="Category"
        options={categories}
        searchPlaceholder="Search categories"
      />

      {text("producer", "Producer")}
      <div className="grid grid-cols-2 gap-4">
        {text("country", "Country")}
        {text("region", "Region")}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {number("abv", "ABV (%)")}
        {number("vintage", "Vintage")}
        {number("age_years", "Age (years)")}
      </div>

      <FormField form={form} name="description" label="Description">
        {(control) => <Textarea rows={3} {...control} {...form.register("description")} />}
      </FormField>

      <ImageUpload
        imageId={editing?.image_id ?? null}
        value={picture.change}
        onChange={picture.setChange}
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...form.register("in_bar")} />
        In the bar now
      </label>

      <SheetFooter className="px-0">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {editing ? "Save" : "Add"}
        </Button>
      </SheetFooter>
    </form>
  );
}
