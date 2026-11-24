import { useInfiniteQuery } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { cocktailListQuery } from "@/api/cocktails.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";
import { ComboboxField, type ControlProps, FormField } from "@/lib/form.tsx";
import type { CocktailForm } from "./cocktail-editor-schema.ts";

export function CocktailVariantFields({
  barId,
  cocktailId,
  parentId,
  parentName,
  form,
}: Readonly<{
  barId: string;
  cocktailId?: string;
  parentId: string;
  parentName?: string;
  form: CocktailForm;
}>): JSX.Element {
  const [selection, setSelection] = useState(parentName);
  const [query, setQuery] = useState("");
  const [text, setText] = useDebouncedSearch(query, setQuery);
  const list = useInfiniteQuery({
    ...cocktailListQuery(barId, {
      sort: "name",
      q: query.trim() || undefined,
      parent_for: cocktailId,
    }),
    placeholderData: undefined,
  });
  const options =
    list.data?.pages.flatMap(({ items }) =>
      items.map(({ id, name }) => ({ value: id, label: name })),
    ) ?? [];

  return (
    <>
      <ComboboxField
        form={form}
        name="variant_of_id"
        label="Variant of"
        options={options}
        placeholder="None"
        fallbackLabel={selection}
        toValue={(value: string): string => {
          setSelection(options.find((option) => option.value === value)?.label);
          setText("");
          return value;
        }}
        searchPlaceholder="Search cocktails"
        search={{ text, onChange: (value: string): void => setText(value.slice(0, 100)) }}
        footer={
          (list.isError || list.hasNextPage) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={list.isFetching}
              onClick={(): void => {
                if (list.isError && !list.isFetchNextPageError) void list.refetch();
                else void list.fetchNextPage();
              }}
            >
              {list.isError ? "Retry loading cocktails" : "Load more cocktails"}
            </Button>
          )
        }
      />
      {parentId && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={(): void => {
              form.setValue("variant_note", "", { shouldDirty: true });
              form.setValue("variant_of_id", "", { shouldDirty: true, shouldValidate: true });
              form.setFocus("variant_of_id");
            }}
          >
            Remove parent
          </Button>
          <FormField form={form} name="variant_note" label="Variant note">
            {(control: ControlProps): JSX.Element => (
              <Textarea rows={2} {...control} {...form.register("variant_note")} />
            )}
          </FormField>
        </>
      )}
    </>
  );
}
