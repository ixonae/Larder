import { UNIT_INFO, UNITS, type Unit, unitNeedsAmount } from "@larder/shared";
import { cn } from "cn";
import { Combobox } from "@/components/combobox.tsx";
import { Input } from "@/components/ui/input.tsx";

export interface Amount {
  amount: number | null;
  unit: Unit;
}

/** An amount and its unit. Units without an amount (`top`, `to_taste`) clear and disable the number. */
export function AmountInput({
  value,
  onChange,
  id,
  className,
  ...aria
}: Readonly<{
  value: Amount;
  onChange: (value: Amount) => void;
  id?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}>) {
  const needsAmount = unitNeedsAmount(value.unit);
  return (
    <div className={cn("flex gap-2", className)}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        aria-label="Amount"
        disabled={!needsAmount}
        value={value.amount ?? ""}
        onChange={(e) =>
          onChange({ ...value, amount: e.target.value === "" ? null : e.target.valueAsNumber })
        }
        className="min-w-0 flex-1"
        {...aria}
      />
      <Combobox
        aria-label="Unit"
        className="w-28 shrink-0"
        value={value.unit}
        onChange={(next) => {
          const unit = next as Unit;
          onChange({ unit, amount: unitNeedsAmount(unit) ? value.amount : null });
        }}
        options={UNITS.map((unit) => ({ value: unit, label: UNIT_INFO[unit].plural }))}
        placeholder="Unit"
        searchPlaceholder="Search units"
      />
    </div>
  );
}
