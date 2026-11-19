import { type BarSummary, flattenTree, hasRole, idSchema, PRODUCT_NAME_MAX } from "@larder/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { categoryTreeQuery } from "@/api/categories.ts";
import { productListQuery } from "@/api/products.ts";
import { BarGate } from "@/components/bar-gate.tsx";
import { NativeSelect } from "@/components/native-select.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Thumbnail } from "@/components/thumbnail.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { CategoryOptions } from "@/features/categories/category-options.tsx";
import { useDebouncedSearch } from "@/lib/debounced-search.ts";
import { InBarToggle } from "./in-bar-toggle.tsx";
import { ProductSheet, type ProductTarget } from "./product-sheet.tsx";

/** List filters live in the URL, so they survive a visit to a bottle and back. Bad values are dropped. */
export const bottlesSearchSchema = z.object({
  q: z.string().max(PRODUCT_NAME_MAX).optional().catch(undefined),
  category: idSchema.optional().catch(undefined),
  in_bar: z.boolean().optional().catch(undefined),
});
export type BottlesSearch = z.infer<typeof bottlesSearchSchema>;

const route = getRouteApi("/bottles");

export function BottlesPage() {
  return <BarGate title="Bottles">{(bar) => <BottlesView key={bar.id} bar={bar} />}</BarGate>;
}

function BottlesView({ bar }: { bar: BarSummary }) {
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
    }),
  );
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Boolean(search.q || search.category || search.in_bar !== undefined);

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-semibold text-2xl">Bottles</h1>
        {canEdit && (
          <Button onClick={() => setTarget("new")}>
            <Plus aria-hidden />
            Add bottle
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            maxLength={PRODUCT_NAME_MAX}
            aria-label="Search bottles"
            placeholder="Search name or producer"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <NativeSelect
          aria-label="Category"
          value={search.category ?? ""}
          onChange={(e) => setSearch({ category: e.target.value || undefined })}
        >
          <option value="">All categories</option>
          <CategoryOptions items={flattenTree(tree.data ?? [])} />
        </NativeSelect>
        <NativeSelect
          aria-label="In the bar"
          value={search.in_bar === undefined ? "" : String(search.in_bar)}
          onChange={(e) =>
            setSearch({ in_bar: e.target.value ? e.target.value === "true" : undefined })
          }
        >
          <option value="">In the bar or not</option>
          <option value="true">In the bar</option>
          <option value="false">Not in the bar</option>
        </NativeSelect>
      </div>

      {list.isPending ? (
        <LoadingState label="Loading bottles…" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState title="No bottles match">Try another search or filter.</EmptyState>
        ) : (
          <EmptyState title="No bottles yet">Add the bottles you own or have tasted.</EmptyState>
        )
      ) : (
        <>
          <ul aria-label="Bottles" className="flex flex-col divide-y rounded-lg border">
            {items.map((product) => (
              <li key={product.id} className="flex items-center gap-3 p-3">
                <Thumbnail imageId={product.image_id} />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/bottles/$productId"
                    params={{ productId: product.id }}
                    className="block truncate font-medium hover:underline"
                  >
                    {product.name}
                  </Link>
                  <p className="truncate text-muted-foreground text-sm">
                    {[product.category_name, product.producer].filter(Boolean).join(" · ")}
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
      )}

      <ProductSheet barId={bar.id} target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
