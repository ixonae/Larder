import {
  type CreatePantryIngredient,
  MAX_PAGE_LIMIT,
  type Page,
  type PantryIngredient,
  type UpdatePantryIngredient,
} from "@larder/shared";
import {
  type InfiniteData,
  infiniteQueryOptions,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";
import type { ApiInfiniteQueryOptions } from "./query-options.ts";
import { stockMeta } from "./stock.ts";

const bar: (typeof api.api.bars)[":barId"] = api.api.bars[":barId"];

type PantryFilters = { q?: string; limit?: number };

export const pantryKey = (barId: string) => ["bars", barId, "pantry"] as const;

/** Pantry ingredients sorted by name. The Pantry screen uses larger pages than the recipe picker. */
export const pantryListQuery = (
  barId: string,
  filters?: PantryFilters,
): ApiInfiniteQueryOptions<PantryIngredient, string, (string | PantryFilters | undefined)[]> =>
  infiniteQueryOptions({
    queryKey: [...pantryKey(barId), "list", filters],
    queryFn: async ({ pageParam, signal }: { pageParam: string; signal: AbortSignal }) => {
      const query = {
        limit: String(filters?.limit ?? MAX_PAGE_LIMIT),
        cursor: pageParam || undefined,
        q: filters?.q,
      };
      return unwrap(
        await bar["pantry-ingredients"].$get({ param: { barId }, query }, { init: { signal } }),
      );
    },
    initialPageParam: "",
    getNextPageParam: (last: Page<PantryIngredient>) => last.next_cursor ?? undefined,
  });

const patchIngredient = async (
  barId: string,
  id: string,
  json: UpdatePantryIngredient,
): Promise<PantryIngredient> =>
  unwrap(await bar["pantry-ingredients"][":id"].$patch({ param: { barId, id }, json }));

/** Create, update and delete from the sheet; each refreshes the bar's pantry queries. */
export function usePantryMutations(barId: string): {
  create: UseMutationResult<PantryIngredient, Error, CreatePantryIngredient>;
  update: UseMutationResult<PantryIngredient, Error, { id: string; json: UpdatePantryIngredient }>;
  remove: UseMutationResult<unknown, Error, string>;
} {
  const queryClient = useQueryClient();
  const onSuccess = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: pantryKey(barId) });
  return {
    create: useMutation({
      meta: stockMeta(barId),
      mutationFn: async (json: CreatePantryIngredient) =>
        unwrap(await bar["pantry-ingredients"].$post({ param: { barId }, json })),
      onSuccess,
    }),
    update: useMutation({
      meta: stockMeta(barId),
      mutationFn: ({ id, json }: { id: string; json: UpdatePantryIngredient }) =>
        patchIngredient(barId, id, json),
      onSuccess,
    }),
    remove: useMutation({
      meta: stockMeta(barId),
      mutationFn: async (id: string) =>
        unwrap(await bar["pantry-ingredients"][":id"].$delete({ param: { barId, id } })),
      onSuccess,
    }),
  };
}

type ListData = InfiniteData<Page<PantryIngredient>, string>;

/**
 * The one-tap stock toggle. The answer is written straight into the cached list, so a tap costs no
 * refetch of every page; the list is only marked stale.
 */
export function useSetPantryStock(
  barId: string,
): UseMutationResult<PantryIngredient, Error, { id: string; in_stock: boolean }> {
  const queryClient = useQueryClient();
  return useMutation({
    meta: stockMeta(barId),
    mutationFn: ({ id, in_stock }: { id: string; in_stock: boolean }) =>
      patchIngredient(barId, id, { in_stock }),
    onSuccess: async (saved: PantryIngredient) => {
      const { queryKey } = pantryListQuery(barId);
      // A refetch already on its way (window focus) holds pre-tap data: drop it so it cannot land
      // over this answer. The list is marked stale below and refetched on the next visit.
      await queryClient.cancelQueries({ queryKey });
      // Only lists still in the cache are touched; those always hold data once the toggle rendered.
      queryClient.setQueriesData<ListData>({ queryKey, exact: true }, (data) => {
        const list = data as ListData;
        return {
          ...list,
          pages: list.pages.map((page) => ({
            ...page,
            items: page.items.map((i) => (i.id === saved.id ? saved : i)),
          })),
        };
      });
      return queryClient.invalidateQueries({ queryKey: pantryKey(barId), refetchType: "none" });
    },
  });
}
