import { cn } from "cn";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { type ReactElement, useId, useState } from "react";
import type { ChipOption } from "@/components/chip-radio-group.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

/**
 * One choice out of a few, picked from a popover. The trigger is a text pill that shows the
 * chosen option once it differs from `initial`, or just an icon button.
 */
export function ChoiceMenu<T extends string | number | boolean | undefined>({
  label,
  options,
  value,
  initial,
  onChange,
  icon: Icon,
}: Readonly<{
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  /** The value that means "not filtering": the trigger looks inactive. */
  initial: T;
  onChange: (value: T) => void;
  /** Shows an icon button instead of the text pill. */
  icon?: LucideIcon;
}>): ReactElement {
  const [open, setOpen] = useState(false);
  const name: string = useId();
  const active: boolean = value !== initial;
  const chosen: string | undefined = options.find((option) => option.value === value)?.label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={label}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full border text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
          Icon ? "w-7 justify-center" : "px-2.5",
          active && "border-brand/50 bg-brand/10 text-brand",
        )}
      >
        {Icon ? (
          <Icon className="size-3.5" aria-hidden />
        ) : (
          <>
            <span>{active ? `${label}: ${chosen}` : label}</span>
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <fieldset aria-label={label} className="grid">
          {options.map(({ value: optionValue, label: optionLabel }) => (
            <label
              key={String(optionValue)}
              className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-muted has-[:focus-visible]:bg-muted"
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={optionValue === value}
                onChange={() => onChange(optionValue)}
                // Choosing the current option fires no change, but should still close the menu.
                onClick={() => setOpen(false)}
              />
              {optionLabel}
              <Check
                className={cn("size-4 text-brand", optionValue !== value && "invisible")}
                aria-hidden
              />
            </label>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
