import type { CreateTastingInput, Page, Tasting, UpdateTasting, Visibility } from "@larder/shared";
import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";
import { productQuery, productsKey } from "./products.ts";
import type { ApiInfiniteQueryOptions, ApiQueryOptions } from "./query-options.ts";

const bar: (typeof api.api.bars)[":barId"] = api.api.bars[":barId"];

export const tastingsKey = (barId: string) => ["bars", barId, "tastings"] as const;

export interface TastingFilters {
  category_id?: string | undefined;
  product_id?: string | undefined;
  score_min?: number | undefined;
  mine?: true | undefined;
  visibility?: Visibility | undefined;
}

/** The bar's tasting journal matching `filters`, newest first, one page at a time. */
export const tastingListQuery = (
  barId: string,
  filters: TastingFilters,
): ApiInfiniteQueryOptions<Tasting, string, (string | TastingFilters)[]> =>
  infiniteQueryOptions({
    queryKey: [...tastingsKey(barId), "list", filters],
    queryFn: async ({ pageParam, signal }: { pageParam: string; signal: AbortSignal }) => {
      const query = {
        ...(filters.category_id && { category_id: filters.category_id }),
        ...(filters.product_id && { product_id: filters.product_id }),
        ...(filters.score_min && { score_min: String(filters.score_min) }),
        ...(filters.mine && { mine: "true" }),
        ...(filters.visibility && { visibility: filters.visibility }),
        ...(pageParam && { cursor: pageParam }),
      };
      return unwrap(await bar.tastings.$get({ param: { barId }, query }, { init: { signal } }));
    },
    initialPageParam: "",
    getNextPageParam: (last: Page<Tasting>) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });

/** How many of a bottle's latest tastings its page shows. */
export const RECENT_TASTINGS = 3;

/** A bottle's latest tastings, for its page. */
export const recentTastingsQuery = (
  barId: string,
  productId: string,
): ApiQueryOptions<Page<Tasting>, string[]> =>
  queryOptions({
    queryKey: [...tastingsKey(barId), "product", productId],
    queryFn: async () =>
      unwrap(
        await bar.products[":id"].tastings.$get({
          param: { barId, id: productId },
          query: { limit: String(RECENT_TASTINGS) },
        }),
      ),
  });

/**
 * Recording, editing and removing tastings. Each refreshes the journal and the bottle's page, whose
 * tasting summary follows; bottle lists are only marked stale and refetch when next shown.
 */
export function useTastingMutations(barId: string): {
  create: UseMutationResult<Tasting, Error, { productId: string; json: CreateTastingInput }>;
  update: UseMutationResult<Tasting, Error, { id: string; json: UpdateTasting }>;
  remove: UseMutationResult<unknown, Error, Pick<Tasting, "id" | "product_id">>;
} {
  const queryClient = useQueryClient();
  const refresh = async (productId: string): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tastingsKey(barId) }),
      queryClient.invalidateQueries({ queryKey: productQuery(barId, productId).queryKey }),
      queryClient.invalidateQueries({
        queryKey: [...productsKey(barId), "list"],
        refetchType: "none",
      }),
    ]);
  };
  return {
    create: useMutation({
      mutationFn: async ({ productId, json }: { productId: string; json: CreateTastingInput }) =>
        unwrap(await bar.products[":id"].tastings.$post({ param: { barId, id: productId }, json })),
      onSuccess: (saved: Tasting) => refresh(saved.product_id),
    }),
    update: useMutation({
      mutationFn: async ({ id, json }: { id: string; json: UpdateTasting }) =>
        unwrap(await bar.tastings[":id"].$patch({ param: { barId, id }, json })),
      onSuccess: (saved: Tasting) => refresh(saved.product_id),
    }),
    remove: useMutation({
      mutationFn: async ({ id }: Pick<Tasting, "id" | "product_id">) =>
        unwrap(await bar.tastings[":id"].$delete({ param: { barId, id } })),
      onSuccess: (_: unknown, { product_id }: Pick<Tasting, "id" | "product_id">) =>
        refresh(product_id),
    }),
  };
}
