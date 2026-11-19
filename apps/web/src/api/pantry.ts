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
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";

const bar = api.api.bars[":barId"];

export const pantryKey = (barId: string) => ["bars", barId, "pantry"] as const;

/** Every pantry ingredient of the bar, sorted by name, in pages as large as the API allows. */
export const pantryListQuery = (barId: string) =>
  infiniteQueryOptions({
    queryKey: [...pantryKey(barId), "list"],
    queryFn: async ({ pageParam }) => {
      const query = { limit: String(MAX_PAGE_LIMIT), ...(pageParam && { cursor: pageParam }) };
      return unwrap(await bar["pantry-ingredients"].$get({ param: { barId }, query }));
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

const patchIngredient = async (barId: string, id: string, json: UpdatePantryIngredient) =>
  unwrap(await bar["pantry-ingredients"][":id"].$patch({ param: { barId, id }, json }));

/** Create, update and delete from the sheet; each refreshes the bar's pantry queries. */
export function usePantryMutations(barId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: pantryKey(barId) });
  return {
    create: useMutation({
      mutationFn: async (json: CreatePantryIngredient) =>
        unwrap(await bar["pantry-ingredients"].$post({ param: { barId }, json })),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ id, json }: { id: string; json: UpdatePantryIngredient }) =>
        patchIngredient(barId, id, json),
      onSuccess,
    }),
    remove: useMutation({
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
export function useSetPantryStock(barId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, in_stock }: { id: string; in_stock: boolean }) =>
      patchIngredient(barId, id, { in_stock }),
    onSuccess: async (saved) => {
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
