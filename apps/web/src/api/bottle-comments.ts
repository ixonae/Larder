import type { BottleComment, BottleCommentInput, UpdateComment, Visibility } from "@larder/shared";
import { infiniteQueryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";
import { productQuery } from "./products.ts";

const comments = () => api.api.bars[":barId"].products[":id"].comments;

// Its own root, so changes to bottles or stock never refetch an open thread.
const threadKey = (barId: string, productId: string) =>
  ["bars", barId, "bottle-comments", productId] as const;

/** A bottle's visible comments, newest first, one page at a time. */
export const bottleCommentsQuery = (
  barId: string,
  productId: string,
  visibility: Visibility | undefined,
) =>
  infiniteQueryOptions({
    queryKey: [...threadKey(barId, productId), visibility],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await comments().$get({
          param: { barId, id: productId },
          query: { ...(pageParam && { cursor: pageParam }), ...(visibility && { visibility }) },
        }),
      ),
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

/** Posting, editing and deleting refresh the thread; posting and deleting also the comment count. */
export function useBottleCommentMutations(barId: string, productId: string) {
  const queryClient = useQueryClient();
  const refreshThread = () =>
    queryClient.invalidateQueries({ queryKey: threadKey(barId, productId) });
  const onSuccess = () =>
    Promise.all([
      refreshThread(),
      queryClient.invalidateQueries({ queryKey: productQuery(barId, productId).queryKey }),
    ]);
  const one = () => comments()[":commentId"];
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
