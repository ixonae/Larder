import {
  type CategoryTreeNode,
  createProductSchema,
  createTastingSchema,
  type Product,
  type ProductStatus,
  type Tasting,
} from "@larder/shared";
import { type JSX, useState } from "react";
import { Controller, type ControllerRenderProps } from "react-hook-form";
import type { z } from "zod";
import { useProductMutations, useSetBottleStatus } from "@/api/products.ts";
import { useTastingMutations } from "@/api/tastings.ts";
import { countryPicker } from "@/components/country-picker.tsx";
import { FeedbackVisibility } from "@/components/feedback-visibility.tsx";
import { RatingStars } from "@/components/rating-stars.tsx";
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
import { localToday } from "@/lib/dates.ts";
import { onClosed } from "@/lib/dialog.ts";
import {
  applyServerErrors,
  ComboboxField,
  type ControlProps,
  FormField,
  useZodForm,
} from "@/lib/form.tsx";
import { BottlePicker, bottleLabel } from "./bottle-picker.tsx";

/** The bottle a tasting is about: enough to name it and suggest a status change. */
export interface TastingBottle {
  id: string;
  name: string;
  status: ProductStatus | null;
}

/** A new tasting (of a known bottle, or one picked in the sheet), an edit, or closed. */
export type TastingTarget =
  | { kind: "new"; bottle?: TastingBottle }
  | { kind: "edit"; tasting: Tasting }
  | null;

/** Statuses a tasting answers: after tasting it, the bottle is no longer only wanted. */
const WANTED: ReadonlySet<ProductStatus | null> = new Set(["want_to_buy", "want_to_try"]);

/** The quick "Add tasting" sheet, also used to edit a tasting. */
export function TastingSheet({
  barId,
  target,
  onClose,
}: Readonly<{ barId: string; target: TastingTarget; onClose: () => void }>): JSX.Element {
  // Here rather than in the form, so the toast's action still works once the sheet has closed.
  const setStatus = useSetBottleStatus(barId);
  const suggestTasted = (bottle: TastingBottle): number =>
    toast("Tasting saved", {
      description: `Mark ${bottle.name} as tasted?`,
      action: {
        label: "Mark as tasted",
        onClick: () => {
          setStatus.mutateAsync({ id: bottle.id, status: "tasted" }).then(
            () => toast(`${bottle.name} marked as tasted`),
            (err: Error) =>
              toast("Could not change the status", { description: err.message, variant: "error" }),
          );
        },
      },
    });
  // The header keeps the last target while the sheet animates closed, instead of flipping to "Add".
  const [shown, setShown] = useState(target);
  if (target !== null && target !== shown) setShown(target);
  const editing = target?.kind === "edit" ? target.tasting : null;
  const preset = target?.kind === "new" ? target.bottle : editing?.product;
  const header = shown?.kind === "edit" ? shown.tasting.product : shown?.bottle;
  return (
    <Sheet open={target !== null} onOpenChange={onClosed(onClose)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{shown?.kind === "edit" ? "Edit tasting" : "Add tasting"}</SheetTitle>
          <SheetDescription>{header?.name ?? "What did you taste?"}</SheetDescription>
        </SheetHeader>
        {target && (
          <TastingForm
            barId={barId}
            editing={editing}
            preset={preset ?? null}
            onSaved={(bottle: TastingBottle): void => {
              if (!editing && WANTED.has(bottle.status)) suggestTasted(bottle);
              else toast("Tasting saved");
              onClose();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

const formSchema = createTastingSchema.required();

function TastingForm({
  barId,
  editing,
  preset,
  onSaved,
}: Readonly<{
  barId: string;
  editing: Tasting | null;
  preset: TastingBottle | null;
  onSaved: (bottle: TastingBottle) => void;
}>): JSX.Element {
  const { create, update } = useTastingMutations(barId);
  const [picked, setPicked] = useState<Product | null>(null);
  const bottle = preset ?? picked;
  const [bottleError, setBottleError] = useState<string | null>(null);
  /** The name typed in the picker while the bottle is being created. */
  const [newName, setNewName] = useState<string | null>(null);
  const form = useZodForm(formSchema, {
    defaultValues: {
      tasted_on: editing?.tasted_on ?? localToday(),
      score: editing?.score ?? null,
      notes: editing?.notes ?? "",
      location: editing?.location ?? "",
      is_private: editing?.is_private ?? false,
    },
  });

  const submit = form.handleSubmit(async (json) => {
    if (!bottle) {
      setBottleError("Choose a bottle");
      return;
    }
    try {
      if (editing) await update.mutateAsync({ id: editing.id, json });
      else await create.mutateAsync({ productId: bottle.id, json });
      onSaved(bottle);
    } catch (err) {
      // The sheet stays open with everything entered, ready to try again.
      if (applyServerErrors(form, err)) return;
      toast("Could not save the tasting", {
        description: (err as Error).message,
        variant: "error",
      });
    }
  });

  return (
    <>
      {newName !== null && (
        <NewBottleForm
          barId={barId}
          name={newName}
          onCancel={(): void => setNewName(null)}
          onCreated={(created: Product): void => {
            setPicked(created);
            setBottleError(null);
            setNewName(null);
          }}
        />
      )}
      <form
        onSubmit={submit}
        className="flex flex-1 flex-col gap-4 px-4"
        noValidate
        hidden={newName !== null}
      >
        {!preset && (
          <BottlePicker
            barId={barId}
            value={picked?.id}
            fallbackLabel={picked ? bottleLabel(picked) : undefined}
            error={bottleError}
            onChange={(next: Product | null): void => {
              setPicked(next);
              setBottleError(null);
            }}
            create={{ label: (name: string): string => `Add “${name}”`, onSelect: setNewName }}
          />
        )}
        <FormField form={form} name="tasted_on" label="Date">
          {(control: ControlProps): JSX.Element => (
            <Input type="date" {...control} {...form.register("tasted_on")} />
          )}
        </FormField>
        <Controller
          control={form.control}
          name="score"
          render={({
            field,
          }: {
            field: ControllerRenderProps<z.input<typeof formSchema>, "score">;
          }): JSX.Element => (
            <div className="grid gap-1.5">
              <span className="font-medium text-sm">Score</span>
              <RatingStars value={field.value} onChange={field.onChange} label="Score" />
            </div>
          )}
        />
        <FormField form={form} name="notes" label="Notes">
          {(control: ControlProps): JSX.Element => (
            <Textarea rows={3} {...control} {...form.register("notes")} />
          )}
        </FormField>
        <FormField form={form} name="location" label="Location">
          {(control: ControlProps): JSX.Element => (
            <Input
              autoComplete="off"
              placeholder="Home, a bar, a distillery…"
              {...control}
              {...form.register("location")}
            />
          )}
        </FormField>
        <Controller
          control={form.control}
          name="is_private"
          render={({
            field,
          }: {
            field: ControllerRenderProps<z.input<typeof formSchema>, "is_private">;
          }): JSX.Element => (
            <FeedbackVisibility
              label="Tasting visibility"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <SheetFooter className="px-0">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Save
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}

const newBottleSchema = createProductSchema
  .pick({ name: true, country: true })
  .required()
  .extend({ category_id: categoryIdField });

/** The minimal "new bottle" form: name, category and an optional country; saved as tasted. */
function NewBottleForm({
  barId,
  name,
  onCancel,
  onCreated,
}: Readonly<{
  barId: string;
  name: string;
  onCancel: () => void;
  onCreated: (bottle: Product) => void;
}>): JSX.Element {
  const { create } = useProductMutations(barId);
  const form = useZodForm(newBottleSchema, {
    defaultValues: { name, category_id: "", country: null },
  });
  const submit = form.handleSubmit(async (json) => {
    try {
      const saved = await create.mutateAsync({ ...json, status: "tasted" });
      toast(`Added ${saved.name}`);
      onCreated(saved);
    } catch (err) {
      if (applyServerErrors(form, err)) return;
      toast("Could not add the bottle", { description: (err as Error).message, variant: "error" });
    }
  });
  return (
    <form onSubmit={submit} aria-label="New bottle" className="flex flex-col gap-4 px-4" noValidate>
      <FormField form={form} name="name" label="Name">
        {(control: ControlProps): JSX.Element => (
          <Input autoComplete="off" {...control} {...form.register("name")} />
        )}
      </FormField>
      <CategoryTreeLoader barId={barId}>
        {(tree: CategoryTreeNode[]): JSX.Element => (
          <ComboboxField
            form={form}
            name="category_id"
            label="Category"
            options={bottleCategoryOptions(tree)}
            searchPlaceholder="Search categories"
          />
        )}
      </CategoryTreeLoader>
      <ComboboxField
        form={form}
        name="country"
        label="Country"
        {...countryPicker}
        clearLabel="No country"
        toValue={(value: string): string | null => value || null}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Add bottle
        </Button>
      </div>
    </form>
  );
}
