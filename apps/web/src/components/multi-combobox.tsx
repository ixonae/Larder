import { searchKey } from "@larder/shared";
import { cn } from "cn";
import { Check, ChevronDown } from "lucide-react";
import { type ReactElement, useState } from "react";
import {
  type ComboboxOption,
  matches,
  optionPath,
  SEARCH_THRESHOLD,
} from "@/components/combobox.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

export interface MultiComboboxProps {
  /** Names the picker: "Alcohol" on its own, "Alcohol: Gin +1" once something is chosen. */
  label: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  options: ComboboxOption[];
  /** Name shown for a chosen value that is not among the options (not loaded yet, or gone). */
  fallbackLabel: string;
  searchPlaceholder: string;
}

/** A pill that opens a filterable list where any number of options can be ticked. */
export function MultiCombobox({
  label,
  values,
  onChange,
  options,
  fallbackLabel,
  searchPlaceholder,
}: Readonly<MultiComboboxProps>): ReactElement {
  const [open, setOpen] = useState(false);
  const names: string[] = values.map(
    (value) => options.find((option) => option.value === value)?.label ?? fallbackLabel,
  );
  const toggle = (value: string): void =>
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-label={label}
        className={cn(
          "flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
          names.length > 0 && "border-brand/50 bg-brand/10 text-brand",
        )}
      >
        <span className="truncate">{names.length === 0 ? label : `${label}: ${names[0]}`}</span>
        {names.length > 1 && (
          <span className="shrink-0 font-medium tabular-nums">+{names.length - 1}</span>
        )}
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] p-0"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Command filter={matches}>
          {options.length > SEARCH_THRESHOLD && (
            <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
          )}
          <CommandList className="max-h-72">
            <CommandEmpty>No matches</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[searchKey(optionPath(option))]}
                  onSelect={() => toggle(option.value)}
                  style={{ paddingLeft: `${0.5 + (option.depth ?? 0)}rem` }}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <Check
                    className={cn(
                      "size-4 text-brand",
                      !values.includes(option.value) && "invisible",
                    )}
                    aria-hidden
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {values.length > 0 && (
            <button
              type="button"
              className="w-full border-t px-3 py-2 text-left text-muted-foreground text-sm hover:bg-muted"
              onClick={() => onChange([])}
            >
              Clear selection
            </button>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
