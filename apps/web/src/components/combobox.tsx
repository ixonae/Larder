import { searchKey } from "@larder/shared";
import { cn } from "cn";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { type JSX, type ReactNode, type Ref, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Options sharing a group are listed under that heading, in first-seen order. */
  group?: string;
  /** Indent level, for trees such as categories. */
  depth?: number;
  /** Ancestors such as "Spirit › Whisky": searched with the label, and shown in results and the trigger. */
  context?: string;
}

/** Above this many options the list gets a search box. */
export const SEARCH_THRESHOLD = 7;

/** "Spirit › Whisky › Scotch": the option with its ancestors. */
export const optionPath = ({ label, context }: ComboboxOption): string =>
  context ? `${context} › ${label}` : label;

// cmdk calls the filter once per item per keystroke: fold the search text once, not per item.
let lastSearch = "";
let lastKey = "";
/** Items carry their already-folded path as their only keyword. */
export const matches = (_value: string, search: string, keywords: string[] = []): 0 | 1 => {
  if (search !== lastSearch) {
    lastSearch = search;
    lastKey = searchKey(search.trim());
  }
  return keywords.some((keyword) => keyword.includes(lastKey)) ? 1 : 0;
};

export interface ComboboxProps {
  id?: string;
  /** The chosen option's value; empty, null or undefined when nothing is chosen. */
  value: string | null | undefined;
  /** Called with the chosen value (empty when cleared) and the label it was listed under. */
  onChange: (value: string, label: string) => void;
  onBlur?: () => void;
  ref?: Ref<HTMLButtonElement>;
  options: ComboboxOption[];
  /** When set, a first entry that clears the choice (for example "All spirits" or "None"). */
  clearLabel?: string;
  /** Trigger text when nothing is chosen; defaults to the clear entry, then "Choose…". */
  placeholder?: string;
  /** Trigger text for a value that is not among the options (not loaded yet, or gone). */
  fallbackLabel?: string;
  searchPlaceholder?: string;
  /** Server-side search: the caller controls the text and filters `options` itself. */
  search?: { text: string; onChange: (text: string) => void };
  /** A last row creating a new entry from the search text ("Add “Talisker”"). */
  create?: { label: (text: string) => string; onSelect: (text: string) => void };
  /** Extra content under the list, such as a loading line or a "load more" button. */
  footer?: ReactNode;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** A select with a search box: a button that opens a filterable list in a popover. */
export function Combobox({
  value: given,
  onChange,
  onBlur,
  options,
  clearLabel,
  placeholder = clearLabel ?? "Choose…",
  fallbackLabel,
  searchPlaceholder = "Search…",
  search,
  create,
  footer,
  className,
  ...trigger
}: Readonly<ComboboxProps>): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const text = search?.text ?? query;
  const setText = search?.onChange ?? setQuery;
  const value = given ?? "";
  const selected = options.find((option) => option.value === value);
  const unselectedLabel = value ? fallbackLabel : clearLabel;
  const label = selected ? optionPath(selected) : (unselectedLabel ?? placeholder);
  // While searching, a tree is shown flat with full paths, so each result says where it sits.
  const searching = text.trim() !== "";
  const groups = new Map<string, ComboboxOption[]>();
  for (const option of options) {
    const heading = option.group ?? "";
    const group = groups.get(heading);
    if (group) group.push(option);
    else groups.set(heading, [option]);
  }

  const close = (): void => {
    setOpen(false);
    setQuery("");
    onBlur?.();
  };
  const choose = (next: string, nextLabel: string): void => {
    onChange(next, nextLabel);
    close();
  };

  return (
    <Popover open={open} onOpenChange={(next: boolean): void => (next ? setOpen(true) : close())}>
      <PopoverTrigger
        type="button"
        role="combobox"
        className={cn(
          "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30",
          className,
        )}
        {...trigger}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>{label}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[max(var(--radix-popover-trigger-width),18rem)] max-w-[calc(100vw-2rem)] p-0"
        onCloseAutoFocus={(event: Event): void => event.preventDefault()}
      >
        <Command filter={matches} shouldFilter={search === undefined}>
          {(search || options.length > SEARCH_THRESHOLD) && (
            <CommandInput
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              value={text}
              onValueChange={setText}
            />
          )}
          <CommandList className="max-h-72">
            <CommandEmpty>No matches</CommandEmpty>
            {clearLabel && (
              <CommandGroup>
                <Item value="" label={clearLabel} active={!value} onSelect={choose} />
              </CommandGroup>
            )}
            {[...groups].map(([heading, items]) => (
              <CommandGroup key={heading} heading={heading || undefined}>
                {items.map((option) => (
                  <Item
                    key={option.value}
                    value={option.value}
                    label={option.label}
                    context={searching ? option.context : undefined}
                    keyword={optionPath(option)}
                    depth={searching ? 0 : option.depth}
                    active={option.value === value}
                    onSelect={choose}
                  />
                ))}
              </CommandGroup>
            ))}
            {create && searching && (
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value={"\u0000create"}
                  onSelect={(): void => {
                    create.onSelect(text.trim());
                    close();
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  {create.label(text.trim())}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
          {footer && <div className="grid gap-2 border-t p-2">{footer}</div>}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Item({
  value,
  label,
  context,
  keyword = label,
  depth = 0,
  active,
  onSelect,
}: Readonly<{
  value: string;
  label: string;
  context?: string;
  keyword?: string;
  depth?: number;
  active: boolean;
  onSelect: (value: string, label: string) => void;
}>): JSX.Element {
  return (
    <CommandItem
      // cmdk needs a unique id per item; matching uses the folded keyword, not this id.
      value={value || "\u0000clear"}
      keywords={[searchKey(keyword)]}
      onSelect={(): void => onSelect(value, label)}
      style={{ paddingLeft: `${0.5 + depth}rem` }}
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-1">
        {context && (
          <>
            <span className="min-w-0 truncate text-muted-foreground text-xs">{context} ›</span>{" "}
          </>
        )}
        <span className="max-w-full shrink-0 truncate">{label}</span>
      </span>
      <Check className={cn("size-4 text-brand", !active && "invisible")} aria-hidden />
    </CommandItem>
  );
}
