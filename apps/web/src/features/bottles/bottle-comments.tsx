import type {
  BarSummary,
  BottleComment,
  BottleCommentInput,
  Product,
  Visibility,
} from "@larder/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { type JSX, useState } from "react";
import { bottleCommentsQuery, useBottleCommentMutations } from "@/api/bottle-comments.ts";
import { useMe } from "@/api/queries.ts";
import { CommentForm } from "@/components/comment-form.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import {
  FeedbackVisibilityFilter,
  PrivateFeedbackLabel,
} from "@/components/feedback-visibility.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { relativeTime } from "@/lib/relative-time.ts";

function CommentItem({
  barId,
  productId,
  comment,
  mine,
}: Readonly<{
  barId: string;
  productId: string;
  comment: BottleComment;
  mine: boolean;
}>): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { edit, remove } = useBottleCommentMutations(barId, productId);
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
              aria-label="Edit comment"
              onClick={(): void => setEditing(true)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="Delete comment"
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
          onSubmit={async (json: BottleCommentInput): Promise<void> => {
            await edit.mutateAsync({ commentId: comment.id, json });
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

/** The bottle's comments, newest first. */
export function BottleComments({
  bar,
  product,
  canEdit,
}: Readonly<{ bar: BarSummary; product: Product; canEdit: boolean }>): JSX.Element {
  const userId = useMe().data?.user.id;
  const [visibility, setVisibility] = useState<Visibility>();
  const thread = useInfiniteQuery(bottleCommentsQuery(bar.id, product.id, visibility));
  const { post } = useBottleCommentMutations(bar.id, product.id);
  const items = thread.data?.pages.flatMap((page) => page.items) ?? [];
  let list: JSX.Element | null = null;
  if (thread.isPending) list = <LoadingState label="Loading comments…" />;
  else if (thread.isError && items.length === 0) {
    list = (
      <ErrorState
        error={thread.error}
        onRetry={(): ReturnType<typeof thread.refetch> => thread.refetch()}
      />
    );
  } else if (items.length === 0) {
    list = <EmptyState title={visibility ? "No comments match" : "No comments yet"} />;
  } else {
    list = (
      <ul aria-label="Comments" className="grid gap-3">
        {items.map((comment) => (
          <CommentItem
            key={comment.id}
            barId={bar.id}
            productId={product.id}
            comment={comment}
            mine={canEdit && comment.author.id === userId}
          />
        ))}
      </ul>
    );
  }
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      {canEdit && (
        <CommentForm
          initial={{ body: "", is_private: false }}
          label="Write a comment"
          submitLabel="Post"
          onSubmit={(json: BottleCommentInput): Promise<BottleComment> => post.mutateAsync(json)}
        />
      )}
      <FeedbackVisibilityFilter value={visibility} onChange={setVisibility} />
      {list}
      {thread.hasNextPage && (
        <Button
          variant="outline"
          disabled={thread.isFetchingNextPage}
          onClick={(): ReturnType<typeof thread.fetchNextPage> => thread.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
