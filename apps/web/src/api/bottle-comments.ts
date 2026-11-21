import type {
  BottleComment,
  BottleCommentInput,
  Page,
  UpdateComment,
  Visibility,
} from "@larder/shared";
import {
  infiniteQueryOptions,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";
import { productQuery } from "./products.ts";
import type { ApiInfiniteQueryOptions } from "./query-options.ts";

type BottleCommentRoutes = (typeof api.api.bars)[":barId"]["products"][":id"]["comments"];

const comments = (): BottleCommentRoutes => api.api.bars[":barId"].products[":id"].comments;

// Its own root, so changes to bottles or stock never refetch an open thread.
const threadKey = (barId: string, productId: string) =>
  ["bars", barId, "bottle-comments", productId] as const;

/** A bottle's visible comments, newest first, one page at a time. */
export const bottleCommentsQuery = (
  barId: string,
  productId: string,
  visibility: Visibility | undefined,
): ApiInfiniteQueryOptions<BottleComment, string, (string | undefined)[]> =>
  infiniteQueryOptions({
    queryKey: [...threadKey(barId, productId), visibility],
    queryFn: async ({ pageParam }: { pageParam: string }) =>
      unwrap(
        await comments().$get({
          param: { barId, id: productId },
          query: { ...(pageParam && { cursor: pageParam }), ...(visibility && { visibility }) },
        }),
      ),
    initialPageParam: "",
    getNextPageParam: (last: Page<BottleComment>) => last.next_cursor ?? undefined,
  });

/** Posting, editing and deleting refresh the thread; posting and deleting also the comment count. */
export function useBottleCommentMutations(
  barId: string,
  productId: string,
): {
  post: UseMutationResult<BottleComment, Error, BottleCommentInput>;
  edit: UseMutationResult<BottleComment, Error, { commentId: string; json: UpdateComment }>;
  remove: UseMutationResult<unknown, Error, string>;
} {
  const queryClient = useQueryClient();
  const refreshThread = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: threadKey(barId, productId) });
  const onSuccess = async (): Promise<void> => {
    await Promise.all([
      refreshThread(),
      queryClient.invalidateQueries({ queryKey: productQuery(barId, productId).queryKey }),
    ]);
  };
  const one = (): BottleCommentRoutes[":commentId"] => comments()[":commentId"];
  return {
    post: useMutation({
      mutationFn: async (json: BottleCommentInput): Promise<BottleComment> =>
        unwrap(await comments().$post({ param: { barId, id: productId }, json })),
      onSuccess,
    }),
    edit: useMutation({
      mutationFn: async ({ commentId, json }: { commentId: string; json: UpdateComment }) =>
        unwrap(await one().$patch({ param: { barId, id: productId, commentId }, json })),
      onSuccess: refreshThread,
    }),
    remove: useMutation({
      mutationFn: async (commentId: string) =>
        unwrap(await one().$delete({ param: { barId, id: productId, commentId } })),
      onSuccess,
    }),
  };
}
