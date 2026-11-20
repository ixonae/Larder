import type { LucideIcon } from "lucide-react";
import { type ReactElement, useId } from "react";
import { toggleChip } from "./toggle-chip.ts";

export type ChipOption<T> = { value: T; label: string; icon?: LucideIcon };

/** One choice out of a few, shown as toggle chips around visually hidden radio buttons. */
export function ChipRadioGroup<T extends string | number | boolean | undefined>({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}>): ReactElement {
  const name: string = useId();
  return (
    <fieldset aria-label={label} className="flex flex-wrap gap-2">
      {options.map(
        ({ value: optionValue, label: optionLabel, icon: Icon }: ChipOption<T>): ReactElement => (
          <label key={String(optionValue)} className={toggleChip({ size: "sm" })}>
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={optionValue === value}
              onChange={(): void => onChange(optionValue)}
            />
            {Icon && <Icon className="size-3" aria-hidden />}
            {optionLabel}
          </label>
        ),
      )}
    </fieldset>
  );
}
