import {
  type Cocktail,
  type CocktailDetail,
  type Comment,
  type CommentInput,
  nowIso,
  type Page,
  type RatingInput,
  type UpdateComment,
} from "@larder/shared";
import {
  type InfiniteData,
  infiniteQueryOptions,
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "@/components/toaster.tsx";
import { api, unwrap } from "./client.ts";
import { cocktailDetailKey, cocktailListKey, cocktailsKey } from "./cocktails.ts";

const bar = api.api.bars[":barId"];
const routes = (): (typeof bar.cocktails)[":id"] => bar.cocktails[":id"];

type QueryKeyPrefix = readonly unknown[];
/** What a set of cached queries held before an optimistic change, for rolling it back. */
type Snapshot<T> = [QueryKeyPrefix, T][];

const isCached = <T>(entry: [QueryKeyPrefix, T | undefined]): entry is [QueryKeyPrefix, T] =>
  entry[1] !== undefined;

/** Applies `update` to every cached query under `prefix`; returns the previous data. */
function patchQueries<T>(
  client: QueryClient,
  prefix: QueryKeyPrefix,
  update: (data: T) => T,
): Snapshot<T> {
  const snapshot: Snapshot<T> = client.getQueriesData<T>({ queryKey: prefix }).filter(isCached);
  for (const [key, data] of snapshot) client.setQueryData<T>(key, update(data));
  return snapshot;
}

function restoreQueries<T>(client: QueryClient, snapshot: Snapshot<T>): void {
  for (const [key, data] of snapshot) client.setQueryData<T>(key, data);
}

/**
 * Sets (or, with null, clears) the caller's rating. Your rating shows at once and rolls back with
 * a toast if the request fails; the average comes from the server afterwards.
 */
export function useSetRating(
  barId: string,
  id: string,
): UseMutationResult<unknown, Error, RatingInput | null, Snapshot<CocktailDetail>> {
  const client: QueryClient = useQueryClient();
  const mutationKey: QueryKeyPrefix = ["rating", barId, id];
  return useMutation<unknown, Error, RatingInput | null, Snapshot<CocktailDetail>>({
    mutationKey,
    mutationFn: async (next: RatingInput | null): Promise<unknown> =>
      next
        ? unwrap(await routes().rating.$put({ param: { barId, id }, json: next }))
        : unwrap(await routes().rating.$delete({ param: { barId, id } })),
    onMutate: async (next: RatingInput | null): Promise<Snapshot<CocktailDetail>> => {
      await client.cancelQueries({ queryKey: cocktailDetailKey(barId, id) });
      return patchQueries<CocktailDetail>(
        client,
        cocktailDetailKey(barId, id),
        (detail: CocktailDetail): CocktailDetail => ({
          ...detail,
          my_rating: next && { ...next, updated_at: nowIso() },
        }),
      );
    },
    onError: (
      error: Error,
      _next: RatingInput | null,
      snapshot: Snapshot<CocktailDetail> | undefined,
    ): void => {
      restoreQueries(client, snapshot ?? []);
      toast("Could not save your rating", { description: error.message, variant: "error" });
    },
    onSettled: async (): Promise<void> => {
      // A newer change is still in flight: refetching now would show this older score again.
      if (client.isMutating({ mutationKey }) > 1) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: cocktailDetailKey(barId, id) }),
        client.invalidateQueries({ queryKey: cocktailListKey(barId) }),
      ]);
    },
  });
}

const commentsKey = (barId: string, id: string): QueryKeyPrefix => [
  ...cocktailsKey(barId),
  "comments",
  id,
];

export const commentsQuery = (barId: string, id: string) =>
  infiniteQueryOptions({
    queryKey: commentsKey(barId, id),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }): Promise<Page<Comment>> =>
      unwrap(await routes().comments.$get({ param: { barId, id }, query: { cursor: pageParam } })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<Comment>): string | undefined => last.next_cursor ?? undefined,
  });

type CommentPages = InfiniteData<Page<Comment>>;

/** Rewrites the loaded comment pages in place, so no page needs fetching again. */
function patchComments(
  client: QueryClient,
  barId: string,
  id: string,
  update: (page: Page<Comment>, index: number) => Page<Comment>,
): void {
  client.setQueriesData<CommentPages>(
    { queryKey: commentsKey(barId, id) },
    (data: CommentPages | undefined): CommentPages | undefined =>
      data && { ...data, pages: data.pages.map(update) },
  );
}

export function usePostComment(
  barId: string,
  id: string,
): UseMutationResult<Comment, Error, CommentInput> {
  const client: QueryClient = useQueryClient();
  return useMutation<Comment, Error, CommentInput>({
    mutationFn: async (json: CommentInput): Promise<Comment> =>
      unwrap(await routes().comments.$post({ param: { barId, id }, json })),
    onSuccess: async (comment: Comment): Promise<void> => {
      // Nothing loaded to patch (the thread failed to load): fetch it so the new comment shows.
      if (client.getQueryData(commentsKey(barId, id)) === undefined) {
        await client.invalidateQueries({ queryKey: commentsKey(barId, id) });
        return;
      }
      patchComments(
        client,
        barId,
        id,
        (page: Page<Comment>, index: number): Page<Comment> =>
          index === 0 ? { ...page, items: [comment, ...page.items] } : page,
      );
    },
  });
}

export function useEditComment(
  barId: string,
  id: string,
): UseMutationResult<Comment, Error, { commentId: string; json: UpdateComment }> {
  const client: QueryClient = useQueryClient();
  return useMutation<Comment, Error, { commentId: string; json: UpdateComment }>({
    mutationFn: async ({ commentId, json }: { commentId: string; json: UpdateComment }) =>
      unwrap(
        await routes().comments[":commentId"].$patch({ param: { barId, id, commentId }, json }),
      ),
    onSuccess: (saved: Comment): void =>
      patchComments(
        client,
        barId,
        id,
        (page: Page<Comment>): Page<Comment> => ({
          ...page,
          items: page.items.map((item: Comment): Comment => (item.id === saved.id ? saved : item)),
        }),
      ),
  });
}

export function useDeleteComment(
  barId: string,
  id: string,
): UseMutationResult<unknown, Error, string> {
  const client: QueryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: async (commentId: string): Promise<unknown> =>
      unwrap(await routes().comments[":commentId"].$delete({ param: { barId, id, commentId } })),
    onSuccess: (_data: unknown, commentId: string): void =>
      patchComments(
        client,
        barId,
        id,
        (page: Page<Comment>): Page<Comment> => ({
          ...page,
          items: page.items.filter((item: Comment): boolean => item.id !== commentId),
        }),
      ),
  });
}

type FavouriteChange = { id: string; favourite: boolean };
type FavouriteSnapshot = {
  details: Snapshot<CocktailDetail>;
  lists: Snapshot<InfiniteData<Page<Cocktail>>>;
};

/**
 * Adds or removes a favourite of any cocktail in the bar. Call it once per screen and pass the
 * cocktail in the change. The detail and the cards update at once and roll back with a toast if
 * the request fails.
 */
export function useSetFavourite(
  barId: string,
): UseMutationResult<unknown, Error, FavouriteChange, FavouriteSnapshot> {
  const client: QueryClient = useQueryClient();
  return useMutation<unknown, Error, FavouriteChange, FavouriteSnapshot>({
    mutationFn: async ({ id, favourite }: FavouriteChange): Promise<unknown> =>
      favourite
        ? unwrap(await routes().favourite.$put({ param: { barId, id } }))
        : unwrap(await routes().favourite.$delete({ param: { barId, id } })),
    onMutate: async ({ id, favourite }: FavouriteChange): Promise<FavouriteSnapshot> => {
      await Promise.all([
        client.cancelQueries({ queryKey: cocktailDetailKey(barId, id) }),
        client.cancelQueries({ queryKey: cocktailListKey(barId) }),
      ]);
      return {
        details: patchQueries<CocktailDetail>(
          client,
          cocktailDetailKey(barId, id),
          (detail: CocktailDetail): CocktailDetail => ({ ...detail, is_favourite: favourite }),
        ),
        lists: patchQueries<InfiniteData<Page<Cocktail>>>(
          client,
          cocktailListKey(barId),
          (data: InfiniteData<Page<Cocktail>>): InfiniteData<Page<Cocktail>> => ({
            ...data,
            pages: data.pages.map(
              (page: Page<Cocktail>): Page<Cocktail> => ({
                ...page,
                items: page.items.map(
                  (item: Cocktail): Cocktail =>
                    item.id === id ? { ...item, is_favourite: favourite } : item,
                ),
              }),
            ),
          }),
        ),
      };
    },
    onError: (
      error: Error,
      _change: FavouriteChange,
      snapshot: FavouriteSnapshot | undefined,
    ): void => {
      restoreQueries(client, snapshot?.details ?? []);
      restoreQueries(client, snapshot?.lists ?? []);
      toast("Could not update your favourites", { description: error.message, variant: "error" });
    },
    // The optimistic change is already right; only favourites-only lists may differ.
    onSettled: (): Promise<void> =>
      client.invalidateQueries({
        queryKey: cocktailListKey(barId),
        predicate: ({ queryKey }): boolean =>
          // A list key ends with its filters.
          (queryKey.at(-1) as { favourite?: boolean }).favourite === true,
      }),
  });
}
