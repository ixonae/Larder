import {
  type CategoryTreeNode,
  createProductSchema,
  flattenTree,
  idSchema,
  type Product,
} from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { categoryTreeQuery } from "@/api/categories.ts";
import { useProductMutations } from "@/api/products.ts";
import { ImageUpload, useImageField } from "@/components/image-upload.tsx";
import { NativeSelect } from "@/components/native-select.tsx";
import { ErrorState, LoadingState } from "@/components/states.tsx";
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
import { CategoryOptions } from "@/features/categories/category-options.tsx";
import { applyServerErrors, emptyToNullNumber, FormField, useZodForm } from "@/lib/form.tsx";

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
        {target && <ProductFormLoader barId={barId} editing={editing} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

/** The API schema, with a message for the empty "Choose…" option of the category picker. */
const formSchema = createProductSchema.extend({
  category_id: idSchema.or(z.literal("")).refine((v) => v !== "", "Choose a category"),
});

interface FormProps {
  barId: string;
  editing: Product | null;
  onDone: () => void;
}

/** The category picker needs the tree: the form waits for it, so the saved category is selected. */
function ProductFormLoader(props: FormProps) {
  const tree = useQuery(categoryTreeQuery(props.barId));
  if (tree.isPending) return <LoadingState label="Loading categories…" />;
  if (tree.isError) return <ErrorState error={tree.error} onRetry={() => tree.refetch()} />;
  return <ProductForm {...props} tree={tree.data} />;
}

function ProductForm({ barId, editing, onDone, tree }: FormProps & { tree: CategoryTreeNode[] }) {
  const { create, update } = useProductMutations(barId);
  const picture = useImageField(barId, "products");
  const categories = useMemo(() => flattenTree(tree), [tree]);

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

      <FormField form={form} name="category_id" label="Category">
        {(control) => (
          <NativeSelect {...control} {...form.register("category_id")}>
            <option value="">Choose…</option>
            <CategoryOptions items={categories} />
          </NativeSelect>
        )}
      </FormField>

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
