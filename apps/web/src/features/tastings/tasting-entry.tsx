import type { Tasting } from "@larder/shared";
import { Link } from "@tanstack/react-router";
import { MapPin, Pencil, Trash2, Wine } from "lucide-react";
import { type JSX, useState } from "react";
import { useTastingMutations } from "@/api/tastings.ts";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { PrivateFeedbackLabel } from "@/components/feedback-visibility.tsx";
import { Score } from "@/components/score.tsx";
import { Thumbnail } from "@/components/thumbnail.tsx";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { formatDate } from "@/lib/dates.ts";

/**
 * One journal entry. Its author (an editor) can edit or delete it; the bar's owner can also delete
 * entries by people who no longer write in the bar (`can_delete`).
 */
export function TastingEntry({
  barId,
  tasting,
  mine,
  showBottle = true,
  onEdit,
}: Readonly<{
  barId: string;
  tasting: Tasting;
  /** The viewer wrote it and may still write in the bar. */
  mine: boolean;
  /** Off on the bottle's own page, where the bottle goes without saying. */
  showBottle?: boolean;
  onEdit: (tasting: Tasting) => void;
}>): JSX.Element {
  const { remove } = useTastingMutations(barId);
  const [deleting, setDeleting] = useState(false);
  const day = formatDate(tasting.tasted_on);
  return (
    <li className="flex gap-3 p-3" aria-label={`${tasting.product.name}, ${day}`}>
      {showBottle && <Thumbnail imageId={tasting.product.image_id} icon={Wine} />}
      <div className="grid min-w-0 flex-1 gap-1">
        {showBottle && (
          <Link
            to="/bottles/$productId"
            params={{ productId: tasting.product_id }}
            className="min-w-0 truncate font-medium hover:underline"
          >
            {tasting.product.name}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
          <Score value={tasting.score} />
          <span>
            {tasting.author.display_name} · {day}
          </span>
          {tasting.is_private && <PrivateFeedbackLabel />}
          {tasting.location && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{tasting.location}</span>
            </span>
          )}
        </div>
        {tasting.notes && <p className="whitespace-pre-line break-words">{tasting.notes}</p>}
      </div>
      {(mine || tasting.can_delete) && (
        <div className="-mr-1 flex shrink-0 items-start">
          {mine && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="Edit tasting"
              onClick={(): void => onEdit(tasting)}
            >
              <Pencil aria-hidden />
            </Button>
          )}
          {tasting.can_delete && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="Delete tasting"
              onClick={(): void => setDeleting(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          )}
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title="Delete this tasting?"
            description="This cannot be undone."
            onConfirm={async (): Promise<void> => {
              await remove.mutateAsync(tasting);
              toast("Tasting deleted");
            }}
          />
        </div>
      )}
    </li>
  );
}
