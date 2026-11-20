import {
  createUtensilSchema,
  UTENSIL_KIND_LABEL,
  UTENSIL_KINDS,
  type Utensil,
} from "@larder/shared";
import { useUtensilMutations } from "@/api/utensils.ts";
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
  applyServerErrors,
  ComboboxField,
  emptyToNullNumber,
  FormField,
  useZodForm,
} from "@/lib/form.tsx";

/** What the sheet is open for: the utensil being edited, `"new"` to add one, or null when closed. */
export type UtensilTarget = Utensil | "new" | null;

/** Create/edit form for a glass or a tool, in a sheet (full width on phones). */
export function UtensilSheet({
  barId,
  target,
  onClose,
}: Readonly<{
  barId: string;
  target: UtensilTarget;
  onClose: () => void;
}>) {
  const editing = target === "new" ? null : target;
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? `Edit ${editing.name}` : "New utensil"}</SheetTitle>
          <SheetDescription>A glass to serve in, or a tool to make drinks with.</SheetDescription>
        </SheetHeader>
        {target && <UtensilForm barId={barId} editing={editing} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function UtensilForm({
  barId,
  editing,
  onDone,
}: Readonly<{
  barId: string;
  editing: Utensil | null;
  onDone: () => void;
}>) {
  const { create, update } = useUtensilMutations(barId);
  const picture = useImageField(barId, "utensils");
  const form = useZodForm(createUtensilSchema, {
    defaultValues: {
      name: editing?.name ?? "",
      kind: editing?.kind ?? "glass",
      capacity_ml: editing?.capacity_ml ?? null,
      description: editing?.description ?? "",
    },
  });
  const isGlass = form.watch("kind") === "glass";

  const submit = form.handleSubmit(async (values) => {
    // The capacity field is hidden for tools: whatever it held is not sent.
    const json = { ...values, capacity_ml: values.kind === "glass" ? values.capacity_ml : null };
    try {
      const saved = editing
        ? await update.mutateAsync({ id: editing.id, json })
        : await create.mutateAsync(json);
      await picture.apply(saved.id, editing ? "Utensil saved" : "Utensil added");
      onDone();
    } catch (err) {
      if (applyServerErrors(form, err)) return;
      toast("Could not save the utensil", {
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

      <ComboboxField
        form={form}
        name="kind"
        label="Kind"
        options={UTENSIL_KINDS.map((kind) => ({
          value: kind,
          label: UTENSIL_KIND_LABEL[kind],
        }))}
      />

      {isGlass && (
        <FormField form={form} name="capacity_ml" label="Capacity (ml)">
          {(control) => (
            <Input
              type="number"
              inputMode="numeric"
              step="any"
              {...control}
              {...form.register("capacity_ml", {
                setValueAs: emptyToNullNumber,
                // Hidden for tools: drop whatever it held, so it is neither validated nor sent.
                shouldUnregister: true,
              })}
            />
          )}
        </FormField>
      )}

      <FormField form={form} name="description" label="Description">
        {(control) => <Textarea rows={3} {...control} {...form.register("description")} />}
      </FormField>

      <ImageUpload
        imageId={editing?.image_id ?? null}
        value={picture.change}
        onChange={picture.setChange}
      />

      <SheetFooter className="px-0">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {editing ? "Save" : "Add"}
        </Button>
      </SheetFooter>
    </form>
  );
}
