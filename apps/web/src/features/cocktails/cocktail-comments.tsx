import type { Comment, CommentInput, Me, Page, UpdateComment } from "@larder/shared";
import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { type ReactElement, useState } from "react";
import { commentsQuery, useDeleteComment, useEditComment, usePostComment } from "@/api/feedback.ts";
import { useMe } from "@/api/queries.ts";
import { CommentForm } from "@/components/comment-form.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { PrivateFeedbackLabel } from "@/components/feedback-visibility.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { relativeTime } from "@/lib/relative-time.ts";

function CommentItem({
  barId,
  cocktailId,
  comment,
  mine,
}: Readonly<{
  barId: string;
  cocktailId: string;
  comment: Comment;
  mine: boolean;
}>): ReactElement {
  const [editing, setEditing] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const edit: UseMutationResult<Comment, Error, { commentId: string; json: UpdateComment }> =
    useEditComment(barId, cocktailId);
  const remove: UseMutationResult<unknown, Error, string> = useDeleteComment(barId, cocktailId);
  return (
    <li className="grid gap-1.5 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <strong className="font-medium">{comment.author.display_name}</strong>
        <span className="text-muted-foreground">{relativeTime(comment.created_at)}</span>
        {comment.edited && <span className="text-muted-foreground">(edited)</span>}
        {comment.is_private && <PrivateFeedbackLabel />}
        {mine && !editing && (
          <span className="ml-auto flex">
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="Edit"
              onClick={(): void => setEditing(true)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="Delete"
              onClick={(): void => setDeleting(true)}
            >
              <Trash2 aria-hidden />
            </Button>
            <ConfirmDialog
              open={deleting}
              onOpenChange={setDeleting}
              title="Delete this comment?"
              description="This cannot be undone."
              onConfirm={(): Promise<unknown> => remove.mutateAsync(comment.id)}
            />
          </span>
        )}
      </div>
      {editing ? (
        <CommentForm
          initial={{ body: comment.body, is_private: comment.is_private }}
          label="Edit comment"
          submitLabel="Save"
          onSubmit={async (input: CommentInput): Promise<void> => {
            await edit.mutateAsync({ commentId: comment.id, json: input });
            setEditing(false);
          }}
          onCancel={(): void => setEditing(false)}
        />
      ) : (
        <p className="whitespace-pre-line break-words">{comment.body}</p>
      )}
    </li>
  );
}

/** The discussion under a recipe, newest first. */
export function CocktailComments({
  barId,
  cocktailId,
}: Readonly<{
  barId: string;
  cocktailId: string;
}>): ReactElement {
  const me: UseQueryResult<Me | null, Error> = useMe();
  const comments: UseInfiniteQueryResult<InfiniteData<Page<Comment>>, Error> = useInfiniteQuery(
    commentsQuery(barId, cocktailId),
  );
  const post: UseMutationResult<Comment, Error, CommentInput> = usePostComment(barId, cocktailId);
  const items: Comment[] =
    comments.data?.pages.flatMap((p: Page<Comment>): Comment[] => p.items) ?? [];
  let content: ReactElement;
  if (comments.isPending) {
    content = <LoadingState label="Loading comments…" />;
  } else if (comments.isError && items.length === 0) {
    content = <ErrorState error={comments.error} onRetry={(): unknown => comments.refetch()} />;
  } else if (items.length === 0) {
    content = <EmptyState title="No comments yet" />;
  } else {
    content = (
      <ul aria-label="Comments" className="grid gap-3">
        {items.map(
          (comment: Comment): ReactElement => (
            <CommentItem
              key={comment.id}
              barId={barId}
              cocktailId={cocktailId}
              comment={comment}
              mine={comment.author.id === me.data?.user.id}
            />
          ),
        )}
      </ul>
    );
  }
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <h2 className="font-semibold text-lg">Comments</h2>
      <CommentForm
        initial={{ body: "", is_private: false }}
        label="Write a comment"
        submitLabel="Post"
        onSubmit={(input: CommentInput): Promise<unknown> => post.mutateAsync(input)}
      />
      {content}
      {comments.isFetchNextPageError && (
        <p role="alert" className="text-destructive text-sm">
          {comments.error.message}
        </p>
      )}
      {comments.hasNextPage && (
        <Button
          variant="outline"
          disabled={comments.isFetchingNextPage}
          onClick={(): unknown => comments.fetchNextPage()}
        >
          {comments.isFetchNextPageError ? "Retry loading more" : "Load more"}
        </Button>
      )}
    </section>
  );
}
