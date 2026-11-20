import { PANTRY_INGREDIENT_NAME_MAX, searchKey } from "@larder/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type Ref, useState } from "react";
import { pantryListQuery } from "@/api/pantry.ts";
import { productListQuery } from "@/api/products.ts";
import { Combobox } from "@/components/combobox.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";
import type { ControlProps } from "@/lib/form.tsx";
import { type SourceOption, sourceOption } from "./cocktail-editor-schema.ts";

const SOURCE_PAGE_SIZE = 25;

interface PickerField {
  name: string;
  value: SourceOption;
  onChange: (option: SourceOption) => void;
  onBlur: () => void;
  ref: Ref<HTMLButtonElement>;
}

export function IngredientSourcePicker({
  barId,
  categories,
  field,
  ...control
}: ControlProps & { barId: string; categories: SourceOption[]; field: PickerField }) {
  const [categoryLimit, setCategoryLimit] = useState(SOURCE_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useDebouncedSearch(query, setQuery);
  const filters = { q: query.trim() || undefined, limit: SOURCE_PAGE_SIZE };
  const bottles = useInfiniteQuery({
    ...productListQuery(barId, filters),
    placeholderData: undefined,
  });
  const pantry = useInfiniteQuery(pantryListQuery(barId, filters));
  // The same accent-insensitive match as the combobox uses when it filters by itself.
  const categoryQuery = searchKey(query.trim());
  const matchingCategories = categories.filter(({ name }) =>
    searchKey(name).includes(categoryQuery),
  );
  const moreCategories = matchingCategories.length > categoryLimit;
  const groups = [
    { label: "Bottle categories", options: matchingCategories.slice(0, categoryLimit) },
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
  const current = field.value;
  const lists = [bottles, pantry];
  const failed = lists.filter((list) => list.isError);
  const more = lists.filter((list) => list.hasNextPage);
  const loading = lists.some((list) => list.isFetching);
  const hasMore = moreCategories || more.length > 0;
  return (
    <Combobox
      {...control}
      {...field}
      value={current.value}
      onChange={(value, name) => field.onChange({ value, name })}
      options={groups.flatMap(({ label, options }) =>
        options.map(({ value, name }) => ({ value, label: name, group: label })),
      )}
      placeholder="Choose an ingredient…"
      fallbackLabel={current.name}
      searchPlaceholder="Search ingredients"
      search={{
        text: search,
        onChange: (value) => {
          setCategoryLimit(SOURCE_PAGE_SIZE);
          setSearch(value.slice(0, PANTRY_INGREDIENT_NAME_MAX));
        },
      }}
      footer={
        (loading || failed.length > 0 || hasMore) && (
          <>
            {loading && (
              <output className="px-1 text-muted-foreground text-sm">
                Loading ingredient choices…
              </output>
            )}
            {failed.length > 0 ? (
              <div role="alert" className="flex items-center justify-between gap-2 px-1 text-sm">
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
              hasMore && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={() => {
                    if (moreCategories) setCategoryLimit((limit) => limit + SOURCE_PAGE_SIZE);
                    return Promise.all(more.map((list) => list.fetchNextPage()));
                  }}
                >
                  Load more ingredient choices
                </Button>
              )
            )}
          </>
        )
      }
    />
  );
}
