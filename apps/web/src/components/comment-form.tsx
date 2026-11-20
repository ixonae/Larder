import { COMMENT_MAX, type CommentInput, commentInputSchema } from "@larder/shared";
import { type ReactElement, useState } from "react";
import { FormError, FormField, useZodForm } from "@/lib/form.tsx";
import { FeedbackVisibility } from "./feedback-visibility.tsx";
import { Button } from "./ui/button.tsx";
import { Textarea } from "./ui/textarea.tsx";

/** Text plus a Public/Only me toggle; used to write a new comment and to edit one. */
export function CommentForm({
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
  const form = useZodForm(commentInputSchema, { mode: "onChange", defaultValues: initial });
  const [error, setError] = useState<Error | null>(null);
  const isPrivate = form.watch("is_private");
  const submit = form.handleSubmit(async (input) => {
    setError(null);
    try {
      await onSubmit(input);
      form.reset(onCancel ? input : initial);
    } catch (err) {
      setError(err as Error);
    }
  });
  return (
    <form onSubmit={submit} className="grid gap-2">
      <FormField form={form} name="body" label={label} srOnlyLabel>
        {(control) => <Textarea {...control} {...form.register("body")} maxLength={COMMENT_MAX} />}
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FeedbackVisibility
          label="Comment visibility"
          value={!!isPrivate}
          onChange={(value) => form.setValue("is_private", value)}
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
