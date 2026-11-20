import {
  type CurrencyCode,
  createPurchaseSchema,
  currencyMinorDigits,
  fromMinorUnits,
  isoDateSchema,
  MAX_PURCHASE_COUNT,
  type Purchase,
  toMinorUnits,
  updatePurchaseSchema,
} from "@larder/shared";
import { z } from "zod";
import { useBuyBottle, usePurchaseMutations } from "@/api/products.ts";
import { currencyPicker } from "@/components/currency-options.ts";
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
import { localToday } from "@/lib/dates.ts";
import {
  applyServerErrors,
  ComboboxField,
  emptyToNullNumber,
  FormField,
  useZodForm,
} from "@/lib/form.tsx";

/** What the sheet records: new bottles of `productName`, or changes to an existing purchase. */
export type PurchaseTarget =
  | { kind: "buy"; productId: string; productName: string }
  | { kind: "edit"; productId: string; productName: string; purchase: Purchase }
  | null;

/** The API fields, with the price in major units (19.99) until it is sent in minor units. */
const formSchema = z.object({
  bought_on: createPurchaseSchema.shape.bought_on,
  price: z.number().min(0).nullable(),
  currency: createPurchaseSchema.shape.currency.unwrap(),
  count: z.number({ error: "Enter how many bottles" }).int().min(1).max(MAX_PURCHASE_COUNT),
  store: createPurchaseSchema.shape.store.unwrap(),
  notes: createPurchaseSchema.shape.notes.unwrap(),
  finished_on: isoDateSchema.nullable(),
});

/** "Bought" (price optional, so restocking stays quick) or "Edit purchase", in a sheet. */
export function PurchaseSheet({
  barId,
  currency,
  target,
  onClose,
}: Readonly<{
  barId: string;
  /** The bar's currency: the default for a new price. */
  currency: CurrencyCode;
  target: PurchaseTarget;
  onClose: () => void;
}>) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{target?.kind === "edit" ? "Edit purchase" : "Bought"}</SheetTitle>
          <SheetDescription>{target?.productName}</SheetDescription>
        </SheetHeader>
        {target && (
          <PurchaseForm barId={barId} currency={currency} target={target} onDone={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PurchaseForm({
  barId,
  currency,
  target,
  onDone,
}: Readonly<{
  barId: string;
  currency: CurrencyCode;
  target: NonNullable<PurchaseTarget>;
  onDone: () => void;
}>) {
  const buy = useBuyBottle(barId);
  const { update: updatePurchase } = usePurchaseMutations(barId);
  const existing = target.kind === "edit" ? target.purchase : null;
  const form = useZodForm(formSchema, {
    defaultValues: {
      bought_on: existing?.bought_on ?? localToday(),
      price:
        existing?.currency && existing.price_minor !== null
          ? fromMinorUnits(existing.price_minor, existing.currency)
          : null,
      currency: existing?.currency ?? currency,
      count: 1,
      store: existing?.store ?? "",
      notes: existing?.notes ?? "",
      finished_on: existing?.finished_on ?? null,
    },
  });
  const digits = currencyMinorDigits(form.watch("currency"));

  /** The price in minor units, or a message when the currency cannot hold it exactly. */
  const toMinor = (price: number, code: CurrencyCode): number | string => {
    const places = currencyMinorDigits(code);
    try {
      const minor = toMinorUnits(price, code);
      if (fromMinorUnits(minor, code) === price) return minor;
    } catch {
      return "This price is too large";
    }
    return places === 0 ? `Enter a whole amount in ${code}` : `Use at most ${places} decimals`;
  };

  const submit = form.handleSubmit(async ({ price, currency, count, finished_on, ...rest }) => {
    const price_minor = price === null ? null : toMinor(price, currency);
    if (typeof price_minor === "string") {
      form.setError("price", { message: price_minor });
      return;
    }
    const priced = price_minor === null ? { price_minor } : { price_minor, currency };
    try {
      if (existing) {
        const json = updatePurchaseSchema.parse({ ...rest, ...priced, finished_on });
        await updatePurchase.mutateAsync({ id: target.productId, purchaseId: existing.id, json });
        toast("Purchase saved");
      } else {
        await buy.mutateAsync({ id: target.productId, json: { ...rest, ...priced, count } });
        toast(count > 1 ? `Added ${count} bottles` : "Added the bottle");
      }
      onDone();
    } catch (err) {
      if (applyServerErrors(form, err)) return;
      toast("Could not save the purchase", {
        description: (err as Error).message,
        variant: "error",
      });
    }
  });

  const date = (name: "bought_on" | "finished_on", label: string) => (
    <FormField form={form} name={name} label={label}>
      {(control) => (
        <Input
          type="date"
          {...control}
          {...form.register(name, name === "finished_on" ? { setValueAs: (v) => v || null } : {})}
        />
      )}
    </FormField>
  );

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-4" noValidate>
      {date("bought_on", "Date")}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField form={form} name="price" label="Price per bottle">
          {(control) => (
            <Input
              type="number"
              inputMode={digits > 0 ? "decimal" : "numeric"}
              min={0}
              step={10 ** -digits}
              placeholder="Optional"
              {...control}
              {...form.register("price", { setValueAs: emptyToNullNumber })}
            />
          )}
        </FormField>
        <ComboboxField form={form} name="currency" label="Currency" {...currencyPicker} />
      </div>
      {existing ? (
        date("finished_on", "Ran out on")
      ) : (
        <FormField form={form} name="count" label="Number of bottles">
          {(control) => (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              {...control}
              {...form.register("count", { valueAsNumber: true })}
            />
          )}
        </FormField>
      )}
      <FormField form={form} name="store" label="Store">
        {(control) => <Input autoComplete="off" {...control} {...form.register("store")} />}
      </FormField>
      <FormField form={form} name="notes" label="Notes">
        {(control) => <Textarea rows={2} {...control} {...form.register("notes")} />}
      </FormField>
      <SheetFooter className="px-0">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {existing ? "Save" : "Add"}
        </Button>
      </SheetFooter>
    </form>
  );
}
