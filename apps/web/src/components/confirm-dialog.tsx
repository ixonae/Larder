import { type UsedBy, usedBySchema } from "@larder/shared";
import type { ChangeEvent, JSX } from "react";
import { useId, useState } from "react";
import { ApiError } from "@/api/client.ts";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

const TYPE_LABEL: Record<UsedBy["used_by"][number]["type"], string> = {
  bar: "Bar",
  category: "Category",
  product: "Bottle",
  purchase: "Purchase",
  tasting: "Tasting",
  pantry_ingredient: "Ingredient",
  cocktail: "Cocktail",
  utensil: "Utensil",
};

/** The "used by" list of a `CONFLICT` refusing a delete, or null for any other error. */
export function usedByOf(error: unknown): UsedBy["used_by"] | null {
  if (!(error instanceof ApiError) || error.code !== "CONFLICT") return null;
  const parsed = usedBySchema.safeParse(error.details);
  return parsed.success ? parsed.data.used_by : null;
}

/**
 * Asks before a destructive action. The dialog stays open while `onConfirm` runs; if it fails, the
 * error is shown in place, with the list of what still uses the item for a `CONFLICT`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  confirmationText,
  onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmationText?: string;
  onConfirm: (confirmation: string) => Promise<unknown>;
}>): JSX.Element {
  const inputId = useId();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const usedBy = usedByOf(error);

  const change = (next: boolean): void => {
    setError(null);
    setConfirmation("");
    onOpenChange(next);
  };

  const confirm = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(confirmation);
      change(false);
    } catch (err) {
      setError(err as Error);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmationText !== undefined && (
          <div className="grid gap-2">
            <Label htmlFor={inputId} className="block break-words leading-snug">
              Type “<strong>{confirmationText}</strong>” to confirm.
            </Label>
            <Input
              id={inputId}
              value={confirmation}
              onChange={(event: ChangeEvent<HTMLInputElement>): void =>
                setConfirmation(event.currentTarget.value)
              }
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="grid gap-2 rounded-md border border-destructive/40 p-3 text-sm"
          >
            <p className="font-medium text-destructive">{error.message}</p>
            {usedBy && (
              <>
                <p className="text-muted-foreground">Still used by:</p>
                <ul className="list-disc pl-5">
                  {usedBy.map((u) => (
                    <li key={`${u.type}-${u.id}`}>
                      {u.name} <span className="text-muted-foreground">({TYPE_LABEL[u.type]})</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{usedBy ? "Close" : "Cancel"}</AlertDialogCancel>
          {!usedBy && (
            <Button
              variant="destructive"
              disabled={
                pending || (confirmationText !== undefined && confirmation !== confirmationText)
              }
              onClick={confirm}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
