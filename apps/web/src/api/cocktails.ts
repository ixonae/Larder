import type { CreateCocktail, ListCocktailsQuery, UpdateCocktail } from "@larder/shared";
import {
  hashKey,
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";
import { collectPages } from "./pagination.ts";

const bar = api.api.bars[":barId"];
export const cocktailsKey = (barId: string) => ["bars", barId, "cocktails"] as const;
/** Every cached cocktail list (any filters). */
export const cocktailListKey = (barId: string) => [...cocktailsKey(barId), "list"] as const;
/** Every cached copy of one cocktail (any serving size). */
export const cocktailDetailKey = (barId: string, id: string) =>
  [...cocktailsKey(barId), "detail", id] as const;
export type CocktailFilters = Omit<ListCocktailsQuery, "limit" | "cursor">;

export const cocktailListQuery = (barId: string, filters: CocktailFilters) =>
  infiniteQueryOptions({
    queryKey: [...cocktailListKey(barId), filters],
    queryFn: async ({ pageParam, signal }) => {
      const query = {
        ...filters,
        missing: filters.missing?.toString(),
        favourite: filters.favourite?.toString(),
        cursor: pageParam,
      };
      return unwrap(await bar.cocktails.$get({ param: { barId }, query }, { init: { signal } }));
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });

export const cocktailQuery = (barId: string, id: string, servings?: number) =>
  queryOptions({
    queryKey: [...cocktailDetailKey(barId, id), servings],
    queryFn: async () =>
      unwrap(
        await bar.cocktails[":id"].$get({
          param: { barId, id },
          query: { servings: servings?.toString() },
        }),
      ),
  });

export const cocktailTagsQuery = (barId: string) =>
  queryOptions({
    queryKey: [...cocktailsKey(barId), "tags"],
    queryFn: () =>
      collectPages(async (query) => unwrap(await bar.tags.$get({ param: { barId }, query }))),
  });

type SaveCocktail = { id?: undefined; json: CreateCocktail } | { id: string; json: UpdateCocktail };

export function useSaveCocktail(barId: string) {
  const client = useQueryClient();
  const endpoint = bar.cocktails;
  return useMutation({
    mutationFn: async ({ id, json }: SaveCocktail) =>
      id !== undefined
        ? unwrap(await endpoint[":id"].$patch({ param: { barId, id }, json }))
        : unwrap(await endpoint.$post({ param: { barId }, json })),
    onSuccess: async (recipe) => {
      const { queryKey } = cocktailQuery(barId, recipe.id);
      await client.cancelQueries({ queryKey, exact: true });
      client.setQueryData(queryKey, recipe);
      const saved = hashKey(queryKey);
      await client.invalidateQueries({
        queryKey: cocktailsKey(barId),
        predicate: (query) => query.queryHash !== saved,
      });
    },
  });
}
