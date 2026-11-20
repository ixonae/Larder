import {
  type CreateUtensil,
  MAX_PAGE_LIMIT,
  type UpdateUtensil,
  type UtensilKind,
} from "@larder/shared";
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";
import { collectPages } from "./pagination.ts";

const bar = api.api.bars[":barId"];

const fetchUtensilPage = (
  barId: string,
  query: { limit: string; cursor?: string; kind?: UtensilKind },
  signal: AbortSignal,
) => bar.utensils.$get({ param: { barId }, query }, { init: { signal } }).then(unwrap);

export const utensilsKey = (barId: string) => ["bars", barId, "utensils"] as const;

/** Every utensil of the bar, sorted by name, in pages as large as the API allows ("Load more"). */
export const utensilListQuery = (barId: string) =>
  infiniteQueryOptions({
    queryKey: [...utensilsKey(barId), "list"],
    queryFn: ({ pageParam, signal }) =>
      fetchUtensilPage(
        barId,
        { limit: String(MAX_PAGE_LIMIT), cursor: pageParam || undefined },
        signal,
      ),
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

export const utensilOptionsQuery = (barId: string, kind?: UtensilKind) =>
  queryOptions({
    queryKey: [...utensilsKey(barId), "options", kind],
    queryFn: ({ signal }) =>
      collectPages((query) => fetchUtensilPage(barId, { ...query, kind }, signal)),
  });

export const utensilQuery = (barId: string, id: string) =>
  queryOptions({
    queryKey: [...utensilsKey(barId), "detail", id],
    queryFn: async () => unwrap(await bar.utensils[":id"].$get({ param: { barId, id } })),
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
