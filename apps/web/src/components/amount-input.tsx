import { UNIT_INFO, UNITS, type Unit, unitNeedsAmount } from "@larder/shared";
import { cn } from "cn";
import { NativeSelect } from "@/components/native-select.tsx";
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
}: {
  value: Amount;
  onChange: (value: Amount) => void;
  id?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string | undefined;
}) {
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
      <NativeSelect
        aria-label="Unit"
        value={value.unit}
        onChange={(e) => {
          const unit = e.target.value as Unit;
          onChange({ unit, amount: unitNeedsAmount(unit) ? value.amount : null });
        }}
      >
        {UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {UNIT_INFO[unit].plural}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
