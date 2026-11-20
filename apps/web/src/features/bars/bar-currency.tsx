import { type BarSummary, barFieldsSchema } from "@larder/shared";
import { currencyPicker } from "@/components/currency-options.ts";
import { Button } from "@/components/ui/button.tsx";
import { ComboboxField, FormError, useZodForm } from "@/lib/form.tsx";
import { BarSettingSheet } from "./bar-setting-sheet.tsx";
import { useUpdateBar } from "./update-bar.ts";

type PricedBar = Pick<BarSummary, "id" | "name" | "currency">;

const currencyFormSchema = barFieldsSchema.pick({ currency: true });

/** Owner-only: opens a sheet to choose the currency prices in this bar are given in. */
export function ChangeCurrencyButton({ bar }: Readonly<{ bar: PricedBar }>) {
  return (
    <BarSettingSheet
      label="Currency"
      ariaLabel={`Change currency of ${bar.name}`}
      title="Bar currency"
      description="Prices in this bar are given in this currency."
    >
      {(onSaved) => <CurrencyForm bar={bar} onSaved={onSaved} />}
    </BarSettingSheet>
  );
}

function CurrencyForm({ bar, onSaved }: Readonly<{ bar: PricedBar; onSaved: () => void }>) {
  const form = useZodForm(currencyFormSchema, { defaultValues: { currency: bar.currency } });
  const update = useUpdateBar(bar.id, onSaved);
  return (
    <form
      className="grid gap-4 px-6 pb-6"
      onSubmit={form.handleSubmit((data) => update.mutate(data))}
    >
      <ComboboxField form={form} name="currency" label="Bar currency" {...currencyPicker} />
      <FormError error={update.error} />
      <Button disabled={update.isPending} type="submit">
        Save currency
      </Button>
    </form>
  );
}
