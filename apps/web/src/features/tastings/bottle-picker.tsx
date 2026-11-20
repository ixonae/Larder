import { nameKey, type Product } from "@larder/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { productListQuery } from "@/api/products.ts";
import { Combobox, type ComboboxProps } from "@/components/combobox.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";

const PICKER_PAGE_SIZE = 25;

export const bottleLabel = ({ name, vintage }: Pick<Product, "name" | "vintage">) =>
  vintage === null ? name : `${name} (${vintage})`;

/** Search and page through bottles when recording or filtering tastings. */
export function BottlePicker({
  barId,
  error,
  onChange,
  create,
  ...props
}: Readonly<
  Pick<ComboboxProps, "value" | "fallbackLabel" | "clearLabel" | "create"> & {
    barId: string;
    error?: string | null;
    onChange: (bottle: Product | null) => void;
  }
>) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [text, setText] = useDebouncedSearch(query, setQuery);
  const bottles = useInfiniteQuery({
    ...productListQuery(barId, { q: query.trim() || undefined, limit: PICKER_PAGE_SIZE }),
    placeholderData: undefined,
  });
  const items = bottles.data?.pages.flatMap((page) => page.items) ?? [];
  // No "Add" row for a bottle already listed: the new one (no vintage) would be a duplicate.
  const typed = nameKey(text.trim());
  const listed = items.some((bottle) => bottle.vintage === null && nameKey(bottle.name) === typed);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Bottle</Label>
      <Combobox
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder={props.clearLabel ?? "Choose a bottle…"}
        searchPlaceholder="Search bottles"
        search={{ text, onChange: setText }}
        options={items.map((bottle) => ({
          value: bottle.id,
          label: `${bottleLabel(bottle)} · ${bottle.category_name}`,
        }))}
        onChange={(value) => onChange(items.find((bottle) => bottle.id === value) ?? null)}
        footer={
          bottles.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              disabled={bottles.isFetchingNextPage}
              onClick={() => bottles.fetchNextPage()}
            >
              Load more bottles
            </Button>
          )
        }
        {...(create && !listed && { create })}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
