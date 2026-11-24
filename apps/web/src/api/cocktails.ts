import type {
  Cocktail,
  CocktailDetail,
  CreateCocktail,
  ListCocktailsQuery,
  Page,
  Tag,
  UpdateCocktail,
} from "@larder/shared";
import {
  hashKey,
  infiniteQueryOptions,
  keepPreviousData,
  type Query,
  queryOptions,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";
import { collectPages } from "./pagination.ts";
import type { ApiInfiniteQueryOptions, ApiQueryOptions } from "./query-options.ts";

const bar: (typeof api.api.bars)[":barId"] = api.api.bars[":barId"];
export const cocktailsKey = (barId: string) => ["bars", barId, "cocktails"] as const;
/** Every cached cocktail list (any filters). */
export const cocktailListKey = (barId: string) => [...cocktailsKey(barId), "list"] as const;
/** Every cached copy of one cocktail (any serving size). */
export const cocktailDetailKey = (barId: string, id: string) =>
  [...cocktailsKey(barId), "detail", id] as const;
type CocktailListFilters = Omit<ListCocktailsQuery, "limit" | "cursor">;
export type CocktailFilters = Omit<CocktailListFilters, "parent_for">;

/** The API takes a list filter as one comma-separated value. */
const joined = (values: readonly string[] | undefined): string | undefined => values?.join(",");

export const cocktailListQuery = (
  barId: string,
  filters: CocktailListFilters,
): ApiInfiniteQueryOptions<Cocktail, string | undefined, (string | CocktailListFilters)[]> =>
  infiniteQueryOptions({
    queryKey: [...cocktailListKey(barId), filters],
    queryFn: async ({
      pageParam,
      signal,
    }: {
      pageParam: string | undefined;
      signal: AbortSignal;
    }) => {
      const query = {
        ...filters,
        alcohol: joined(filters.alcohol),
        mixer: joined(filters.mixer),
        method: joined(filters.method),
        tag: joined(filters.tag),
        missing: filters.missing?.toString(),
        favourite: filters.favourite?.toString(),
        cursor: pageParam,
      };
      return unwrap(await bar.cocktails.$get({ param: { barId }, query }, { init: { signal } }));
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<Cocktail>) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });

export const cocktailQuery = (
  barId: string,
  id: string,
  servings?: number,
): ApiQueryOptions<CocktailDetail, (string | number | undefined)[]> =>
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

export const cocktailTagsQuery = (barId: string): ApiQueryOptions<Tag[], string[]> =>
  queryOptions({
    queryKey: [...cocktailsKey(barId), "tags"],
    queryFn: () =>
      collectPages(async (query) => unwrap(await bar.tags.$get({ param: { barId }, query }))),
  });

type SaveCocktail = { id?: undefined; json: CreateCocktail } | { id: string; json: UpdateCocktail };

export function useSaveCocktail(
  barId: string,
): UseMutationResult<CocktailDetail, Error, SaveCocktail> {
  const client = useQueryClient();
  const endpoint = bar.cocktails;
  return useMutation({
    mutationFn: async ({ id, json }: SaveCocktail) =>
      id !== undefined
        ? unwrap(await endpoint[":id"].$patch({ param: { barId, id }, json }))
        : unwrap(await endpoint.$post({ param: { barId }, json })),
    onSuccess: async (recipe: CocktailDetail) => {
      const { queryKey } = cocktailQuery(barId, recipe.id);
      await client.cancelQueries({ queryKey, exact: true });
      client.setQueryData(queryKey, recipe);
      const saved = hashKey(queryKey);
      await client.invalidateQueries({
        queryKey: cocktailsKey(barId),
        predicate: (query: Query) => query.queryHash !== saved,
      });
    },
  });
}
