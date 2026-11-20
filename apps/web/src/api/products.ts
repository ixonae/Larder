import type { CreateProduct, Page, Product, UpdateProduct } from "@larder/shared";
import {
  hashKey,
  type InfiniteData,
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";
import { stockMeta } from "./stock.ts";

const bar = api.api.bars[":barId"];

export const productsKey = (barId: string) => ["bars", barId, "products"] as const;

export interface ProductFilters {
  q?: string;
  category_id?: string;
  in_bar?: boolean;
  limit?: number;
}

/** The bar's bottles matching `filters`, sorted by name, one page at a time ("Load more"). */
export const productListQuery = (barId: string, filters: ProductFilters) =>
  infiniteQueryOptions({
    queryKey: [...productsKey(barId), "list", filters],
    queryFn: async ({ pageParam, signal }) => {
      const query = {
        limit: filters.limit?.toString(),
        ...(filters.q && { q: filters.q }),
        ...(filters.category_id && { category_id: filters.category_id }),
        ...(filters.in_bar !== undefined && { in_bar: String(filters.in_bar) }),
        ...(pageParam && { cursor: pageParam }),
      };
      return unwrap(await bar.products.$get({ param: { barId }, query }, { init: { signal } }));
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    // Keep the current list on screen while a new filter loads.
    placeholderData: keepPreviousData,
  });

export const productQuery = (barId: string, id: string) =>
  queryOptions({
    queryKey: [...productsKey(barId), "detail", id],
    queryFn: async () => unwrap(await bar.products[":id"].$get({ param: { barId, id } })),
  });

/** Create, update and delete; each refreshes every product query of the bar. */
export function useProductMutations(barId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: productsKey(barId) });
  return {
    create: useMutation({
      meta: stockMeta(barId),
      mutationFn: async (json: CreateProduct) =>
        unwrap(await bar.products.$post({ param: { barId }, json })),
      onSuccess,
    }),
    update: useMutation({
      meta: stockMeta(barId),
      mutationFn: async ({ id, json }: { id: string; json: UpdateProduct }) =>
        unwrap(await bar.products[":id"].$patch({ param: { barId, id }, json })),
      onSuccess,
    }),
    remove: useMutation({
      meta: stockMeta(barId),
      mutationFn: async (id: string) =>
        unwrap(await bar.products[":id"].$delete({ param: { barId, id } })),
      // Everything but the deleted bottle's own page, which is still open: refetching it would only
      // flash a 404 before the page navigates away.
      onSuccess: (_, id) => {
        const deleted = hashKey(productQuery(barId, id).queryKey);
        return queryClient.invalidateQueries({
          queryKey: productsKey(barId),
          predicate: (query) => query.queryHash !== deleted,
        });
      },
    }),
  };
}

type ListData = InfiniteData<Page<Product>, string>;

/**
 * The one-tap in-bar toggle. The answer is written straight into the cached detail and lists, so a tap
 * costs no refetch; other lists are only marked stale (a filtered list keeps the row until then).
 */
export function useSetProductInBar(barId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: stockMeta(barId),
    mutationFn: async ({ id, in_bar }: { id: string; in_bar: boolean }) =>
      unwrap(
        await bar.products[":id"]["in-bar"].$patch({ param: { barId, id }, json: { in_bar } }),
      ),
    onSuccess: (product) => {
      queryClient.setQueryData(productQuery(barId, product.id).queryKey, product);
      queryClient.setQueriesData<ListData>({ queryKey: [...productsKey(barId), "list"] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map((p) => (p.id === product.id ? product : p)),
              })),
            }
          : data,
      );
      return queryClient.invalidateQueries({ queryKey: productsKey(barId), refetchType: "none" });
    },
  });
}
