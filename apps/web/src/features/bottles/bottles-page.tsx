import {
  type BarSummary,
  countryName,
  countrySchema,
  hasRole,
  idSchema,
  NO_STATUS,
  PRODUCT_NAME_MAX,
  PRODUCT_STATUSES,
} from "@larder/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Heart, Plus, Wine } from "lucide-react";
import { type ReactNode, useState } from "react";
import { z } from "zod";
import { categoryTreeQuery } from "@/api/categories.ts";
import { productListQuery, useSetBottleFavourite } from "@/api/products.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { Combobox } from "@/components/combobox.tsx";
import { CountryPicker } from "@/components/country-picker.tsx";
import { FavouriteButton } from "@/components/favourite-button.tsx";
import { Score } from "@/components/score.tsx";
import { SearchInput } from "@/components/search-input.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Thumbnail } from "@/components/thumbnail.tsx";
import { toggleChip } from "@/components/toggle-chip.ts";
import { Button } from "@/components/ui/button.tsx";
import { bottleCategoryOptions } from "@/features/categories/category-options.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";
import { trueOnlyFlag } from "@/lib/search-params.ts";
import { statusLabel } from "./bottle-status.tsx";
import { BottlesTabs } from "./bottles-tabs.tsx";
import { ProductSheet, type ProductTarget } from "./product-sheet.tsx";
import { StockAction } from "./stock-action.tsx";

/** The status chips, in order: every status, then bottles without one. */
const STATUS_FILTERS = [...PRODUCT_STATUSES, NO_STATUS] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/** List filters live in the URL, so they survive a visit to a bottle and back. Bad values are dropped. */
export const bottlesSearchSchema = z.object({
  q: z.string().max(PRODUCT_NAME_MAX).optional().catch(undefined),
  category: idSchema.optional().catch(undefined),
  status: z.array(z.enum(STATUS_FILTERS)).min(1).optional().catch(undefined),
  country: countrySchema.optional().catch(undefined),
  favourite: trueOnlyFlag,
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
      status: search.status,
      country: search.country,
      favourite: search.favourite,
    }),
  );
  const setFavourite = useSetBottleFavourite(bar.id);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Boolean(
    search.q || search.category || search.country || search.status || search.favourite,
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
                <div className="flex min-w-0 items-center gap-2">
                  {product.tasting_summary.avg_score !== null && (
                    <Score value={product.tasting_summary.avg_score} />
                  )}
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
              </div>
              <FavouriteButton
                favourite={product.is_favourite}
                disabled={setFavourite.pendingIds.includes(product.id)}
                onToggle={(favourite) => setFavourite.mutate({ id: product.id, favourite })}
              />
              <StockAction
                barId={bar.id}
                currency={bar.currency}
                product={product}
                canEdit={canEdit}
              />
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
      <BottlesTabs />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-3xl">Bottles</h1>
        {canEdit && (
          <Button onClick={() => setTarget("new")}>
            <Plus aria-hidden />
            Add bottle
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto]">
        <SearchInput
          className="sm:col-span-2 lg:col-span-1"
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
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Status</legend>
        <label className={toggleChip({ size: "sm" })}>
          <input
            type="checkbox"
            className="sr-only"
            checked={search.favourite === true}
            onChange={(event) => setSearch({ favourite: event.target.checked || undefined })}
          />
          <Heart className="size-3.5" aria-hidden />
          Favourites
        </label>
        {STATUS_FILTERS.map((status) => {
          const selected: StatusFilter[] = search.status ?? [];
          const checked = selected.includes(status);
          return (
            <label key={status} className={toggleChip({ size: "sm" })}>
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => {
                  const next = checked
                    ? selected.filter((s) => s !== status)
                    : STATUS_FILTERS.filter((s) => s === status || selected.includes(s));
                  setSearch({ status: next.length > 0 ? next : undefined });
                }}
              />
              {statusLabel(status === NO_STATUS ? null : status)}
            </label>
          );
        })}
      </fieldset>

      {content}

      <ProductSheet barId={bar.id} target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
