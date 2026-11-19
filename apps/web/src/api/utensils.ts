import { type CreateUtensil, MAX_PAGE_LIMIT, type UpdateUtensil } from "@larder/shared";
import { infiniteQueryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";

const bar = api.api.bars[":barId"];

export const utensilsKey = (barId: string) => ["bars", barId, "utensils"] as const;

/** Every utensil of the bar, sorted by name, in pages as large as the API allows ("Load more"). */
export const utensilListQuery = (barId: string) =>
  infiniteQueryOptions({
    queryKey: [...utensilsKey(barId), "list"],
    queryFn: async ({ pageParam }) => {
      const query = { limit: String(MAX_PAGE_LIMIT), ...(pageParam && { cursor: pageParam }) };
      return unwrap(await bar.utensils.$get({ param: { barId }, query }));
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

/** Create, update and delete; each refreshes the bar's utensil queries. */
export function useUtensilMutations(barId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: utensilsKey(barId) });
  return {
    create: useMutation({
      mutationFn: async (json: CreateUtensil) =>
        unwrap(await bar.utensils.$post({ param: { barId }, json })),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: async ({ id, json }: { id: string; json: UpdateUtensil }) =>
        unwrap(await bar.utensils[":id"].$patch({ param: { barId, id }, json })),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (id: string) =>
        unwrap(await bar.utensils[":id"].$delete({ param: { barId, id } })),
      onSuccess,
    }),
  };
}
