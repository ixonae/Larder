import { PANTRY_INGREDIENT_NAME_MAX } from "@larder/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type Ref, useState } from "react";
import { pantryListQuery } from "@/api/pantry.ts";
import { productListQuery } from "@/api/products.ts";
import { NativeSelect } from "@/components/native-select.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";
import type { ControlProps } from "@/lib/form.tsx";
import { emptySource, type SourceOption, sourceOption } from "./cocktail-editor-schema.ts";

const SOURCE_PAGE_SIZE = 25;

interface PickerField {
  name: string;
  value: SourceOption;
  onChange: (option: SourceOption) => void;
  onBlur: () => void;
  ref: Ref<HTMLSelectElement>;
}

export function IngredientSourcePicker({
  barId,
  categories,
  field,
  ...control
}: ControlProps & { barId: string; categories: SourceOption[]; field: PickerField }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useDebouncedSearch(query, setQuery);
  const filters = { q: query.trim() || undefined, limit: SOURCE_PAGE_SIZE };
  const bottles = useInfiniteQuery({
    ...productListQuery(barId, filters),
    placeholderData: undefined,
  });
  const pantry = useInfiniteQuery(pantryListQuery(barId, filters));
  const groups = [
    { label: "Bottle categories", options: categories },
    {
      label: "Bottles",
      options:
        bottles.data?.pages.flatMap(({ items }) =>
          items.map(({ id, name, category_name }) =>
            sourceOption("product_id", id, `${name} · ${category_name}`),
          ),
        ) ?? [],
    },
    {
      label: "Pantry ingredients",
      options:
        pantry.data?.pages.flatMap(({ items }) =>
          items.map(({ id, name, category_name }) =>
            sourceOption("pantry_ingredient_id", id, `${name} · ${category_name}`),
          ),
        ) ?? [],
    },
  ];
  const options = groups.flatMap(({ options }) => options);
  const current = field.value;
  const lists = [bottles, pantry];
  const failed = lists.filter((list) => list.isError);
  const more = lists.filter((list) => list.hasNextPage);
  const loading = lists.some((list) => list.isFetching);
  return (
    <div className="grid gap-2">
      <NativeSelect
        className="w-full min-w-0"
        {...control}
        {...field}
        value={current.value}
        onChange={(event) =>
          field.onChange(options.find(({ value }) => value === event.target.value) ?? emptySource)
        }
      >
        <option value="">Choose an ingredient…</option>
        {current.value && !options.some(({ value }) => value === current.value) && (
          <option value={current.value}>{current.name}</option>
        )}
        {groups.map(({ label, options }) => (
          <optgroup key={label} label={label}>
            {options.map(({ value, name }) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
      </NativeSelect>
      <Input
        type="search"
        aria-label="Search bottles and pantry"
        placeholder="Search bottles and pantry"
        maxLength={PANTRY_INGREDIENT_NAME_MAX}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {loading && (
        <p role="status" className="text-muted-foreground text-sm">
          Loading ingredient choices…
        </p>
      )}
      {failed.length > 0 ? (
        <div role="alert" className="flex items-center justify-between gap-2 text-sm">
          <span>Could not load ingredient choices.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() =>
              Promise.all(
                failed.map((list) =>
                  list.isFetchNextPageError ? list.fetchNextPage() : list.refetch(),
                ),
              )
            }
          >
            Try again
          </Button>
        </div>
      ) : (
        more.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={loading}
            onClick={() => Promise.all(more.map((list) => list.fetchNextPage()))}
          >
            Load more ingredient choices
          </Button>
        )
      )}
    </div>
  );
}
