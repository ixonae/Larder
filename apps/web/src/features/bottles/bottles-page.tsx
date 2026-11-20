import {
  type BarSummary,
  countryName,
  countrySchema,
  hasRole,
  idSchema,
  PRODUCT_NAME_MAX,
} from "@larder/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Plus, Wine } from "lucide-react";
import { type ReactNode, useState } from "react";
import { z } from "zod";
import { categoryTreeQuery } from "@/api/categories.ts";
import { productListQuery } from "@/api/products.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { Combobox } from "@/components/combobox.tsx";
import { CountryPicker } from "@/components/country-picker.tsx";
import { SearchInput } from "@/components/search-input.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Thumbnail } from "@/components/thumbnail.tsx";
import { Button } from "@/components/ui/button.tsx";
import { bottleCategoryOptions } from "@/features/categories/category-options.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";
import { InBarToggle } from "./in-bar-toggle.tsx";
import { ProductSheet, type ProductTarget } from "./product-sheet.tsx";

/** List filters live in the URL, so they survive a visit to a bottle and back. Bad values are dropped. */
export const bottlesSearchSchema = z.object({
  q: z.string().max(PRODUCT_NAME_MAX).optional().catch(undefined),
  category: idSchema.optional().catch(undefined),
  in_bar: z.boolean().optional().catch(undefined),
  country: countrySchema.optional().catch(undefined),
});
export type BottlesSearch = z.infer<typeof bottlesSearchSchema>;

const route = getRouteApi("/bottles");

export function BottlesPage() {
  return <BarGate title="Bottles">{(bar) => <BottlesView key={bar.id} bar={bar} />}</BarGate>;
}

function BottlesView({ bar }: Readonly<{ bar: BarSummary }>) {
  const canEdit = hasRole(bar.role, "editor");
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const setSearch = (patch: Partial<BottlesSearch>) =>
    navigate({ search: { ...search, ...patch }, replace: true });
  const [target, setTarget] = useState<ProductTarget>(null);
  const [q, setQ] = useDebouncedSearch(search.q ?? "", (value) =>
    setSearch({ q: value || undefined }),
  );

  const tree = useQuery(categoryTreeQuery(bar.id));
  const list = useInfiniteQuery(
    productListQuery(bar.id, {
      q: search.q?.trim() || undefined,
      category_id: search.category,
      in_bar: search.in_bar,
      country: search.country,
    }),
  );
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Boolean(
    search.q || search.category || search.country || search.in_bar !== undefined,
  );

  let content: ReactNode;
  if (list.isPending) {
    content = <LoadingState label="Loading bottles…" />;
  } else if (list.isError) {
    content = <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  } else if (items.length === 0) {
    content = filtered ? (
      <EmptyState title="No bottles match">Try another search or filter.</EmptyState>
    ) : (
      <EmptyState title="No bottles yet">Add the bottles you own or have tasted.</EmptyState>
    );
  } else {
    content = (
      <>
        <ul
          aria-label="Bottles"
          className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs"
        >
          {items.map((product) => (
            <li key={product.id} className="flex items-center gap-3 p-3">
              <Thumbnail imageId={product.image_id} icon={Wine} />
              <div className="min-w-0 flex-1">
                <Link
                  to="/bottles/$productId"
                  params={{ productId: product.id }}
                  className="block truncate font-medium hover:underline"
                >
                  {product.name}
                </Link>
                <p className="truncate text-muted-foreground text-sm">
                  {[
                    product.category_name,
                    product.producer,
                    product.country && countryName(product.country),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <InBarToggle barId={bar.id} product={product} canEdit={canEdit} />
            </li>
          ))}
        </ul>
        {list.hasNextPage && (
          <Button
            variant="outline"
            disabled={list.isFetchingNextPage}
            onClick={() => list.fetchNextPage()}
          >
            Load more
          </Button>
        )}
      </>
    );
  }

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-3xl">Bottles</h1>
        {canEdit && (
          <Button onClick={() => setTarget("new")}>
            <Plus aria-hidden />
            Add bottle
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_auto_auto_auto]">
        <SearchInput
          className="sm:col-span-3 lg:col-span-1"
          maxLength={PRODUCT_NAME_MAX}
          aria-label="Search bottles"
          placeholder="Search name or producer"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Combobox
          aria-label="Category"
          className="lg:w-48"
          value={search.category}
          onChange={(value) => setSearch({ category: value || undefined })}
          options={bottleCategoryOptions(tree.data ?? [], search.category)}
          clearLabel="All categories"
          searchPlaceholder="Search categories"
        />
        <CountryPicker
          aria-label="Country"
          className="lg:w-44"
          value={search.country}
          onChange={(value) => setSearch({ country: countrySchema.safeParse(value).data })}
          clearLabel="All countries"
        />
        <Combobox
          aria-label="In the bar"
          className="lg:w-44"
          value={search.in_bar === undefined ? "" : String(search.in_bar)}
          onChange={(value) => setSearch({ in_bar: value ? value === "true" : undefined })}
          options={[
            { value: "true", label: "In the bar" },
            { value: "false", label: "Not in the bar" },
          ]}
          clearLabel="In the bar or not"
        />
      </div>

      {content}

      <ProductSheet barId={bar.id} target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
