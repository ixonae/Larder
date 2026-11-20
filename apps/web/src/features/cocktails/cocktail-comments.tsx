import {
  COMMENT_MAX,
  type Comment,
  type CommentInput,
  commentInputSchema,
  type Me,
  type Page,
  type UpdateComment,
} from "@larder/shared";
import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { Globe, Lock, Pencil, Trash2 } from "lucide-react";
import { type BaseSyntheticEvent, type ReactElement, useState } from "react";
import { commentsQuery, useDeleteComment, useEditComment, usePostComment } from "@/api/feedback.ts";
import { useMe } from "@/api/queries.ts";
import { type ChipOption, ChipRadioGroup } from "@/components/chip-radio-group.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { EmptyState, ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { type ControlProps, FormError, FormField, useZodForm } from "@/lib/form.tsx";
import { relativeTime } from "@/lib/relative-time.ts";

const VISIBILITY: ChipOption<boolean>[] = [
  { value: false, label: "Public", icon: Globe },
  { value: true, label: "Only me", icon: Lock },
];

/** Text plus a Public/Only me toggle; used to write a new comment and to edit one. */
function CommentForm({
  initial,
  label,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CommentInput;
  label: string;
  submitLabel: string;
  onSubmit: (input: CommentInput) => Promise<unknown>;
  onCancel?: () => void;
}): ReactElement {
  const form: ReturnType<typeof useZodForm<typeof commentInputSchema>> = useZodForm(
    commentInputSchema,
    { mode: "onChange", defaultValues: initial },
  );
  const [error, setError] = useState<Error | null>(null);
  const isPrivate: boolean | undefined = form.watch("is_private");
  const submit: (event?: BaseSyntheticEvent) => Promise<void> = form.handleSubmit(
    async (input: CommentInput): Promise<void> => {
      setError(null);
      try {
        await onSubmit(input);
        form.reset(onCancel ? input : initial);
      } catch (err) {
        setError(err as Error);
      }
    },
  );
  return (
    <form onSubmit={submit} className="grid gap-2">
      <FormField form={form} name="body" label={label} srOnlyLabel>
        {(control: ControlProps): ReactElement => (
          <Textarea {...control} {...form.register("body")} maxLength={COMMENT_MAX} />
        )}
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChipRadioGroup<boolean>
          label="Comment visibility"
          options={VISIBILITY}
          value={!!isPrivate}
          onChange={(value: boolean): void => form.setValue("is_private", value)}
        />
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </div>
      <FormError error={error} />
    </form>
  );
}

function CommentItem({
  barId,
  cocktailId,
  comment,
  mine,
}: {
  barId: string;
  cocktailId: string;
  comment: Comment;
  mine: boolean;
}): ReactElement {
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
        {mine && comment.is_private && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Lock className="size-3.5" aria-hidden />
            Only you
          </span>
        )}
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
}: {
  barId: string;
  cocktailId: string;
}): ReactElement {
  const me: UseQueryResult<Me | null, Error> = useMe();
  const comments: UseInfiniteQueryResult<InfiniteData<Page<Comment>>, Error> = useInfiniteQuery(
    commentsQuery(barId, cocktailId),
  );
  const post: UseMutationResult<Comment, Error, CommentInput> = usePostComment(barId, cocktailId);
  const items: Comment[] =
    comments.data?.pages.flatMap((p: Page<Comment>): Comment[] => p.items) ?? [];
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <h2 className="font-semibold text-lg">Comments</h2>
      <CommentForm
        initial={{ body: "", is_private: false }}
        label="Write a comment"
        submitLabel="Post"
        onSubmit={(input: CommentInput): Promise<unknown> => post.mutateAsync(input)}
      />
      {comments.isPending ? (
        <LoadingState label="Loading comments…" />
      ) : comments.isError && items.length === 0 ? (
        <ErrorState error={comments.error} onRetry={(): unknown => comments.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No comments yet" />
      ) : (
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
      )}
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
