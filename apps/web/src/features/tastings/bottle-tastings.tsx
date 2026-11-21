import type { BarSummary, Product, Tasting } from "@larder/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Star } from "lucide-react";
import { type JSX, useState } from "react";
import { useMe } from "@/api/queries.ts";
import { RECENT_TASTINGS, recentTastingsQuery } from "@/api/tastings.ts";
import { ErrorState, LoadingState } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { formatDate } from "@/lib/dates.ts";
import { TastingEntry } from "./tasting-entry.tsx";
import { TastingSheet, type TastingTarget } from "./tasting-sheet.tsx";

/**
 * The bottle's tastings: its overall rating (the average of the tasting scores), when it was last
 * tasted and the latest entries.
 */
export function BottleTastings({
  bar,
  product,
  canEdit,
}: Readonly<{ bar: BarSummary; product: Product; canEdit: boolean }>): JSX.Element {
  const userId = useMe().data?.user.id;
  const recent = useQuery(recentTastingsQuery(bar.id, product.id));
  const [target, setTarget] = useState<TastingTarget>(null);
  const { count, avg_score, last_tasted_on } = product.tasting_summary;
  let list: JSX.Element | null = null;
  if (recent.isPending) list = <LoadingState label="Loading tastings…" />;
  else if (recent.isError) {
    list = (
      <ErrorState
        error={recent.error}
        onRetry={(): ReturnType<typeof recent.refetch> => recent.refetch()}
      />
    );
  } else if (recent.data.items.length > 0) {
    list = (
      <ul
        aria-label="Latest tastings"
        className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs"
      >
        {recent.data.items.map((tasting) => (
          <TastingEntry
            key={tasting.id}
            barId={bar.id}
            tasting={tasting}
            showBottle={false}
            mine={canEdit && tasting.author.id === userId}
            onEdit={(edited: Tasting): void => setTarget({ kind: "edit", tasting: edited })}
          />
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
        {count === 0 ? (
          <p className="text-muted-foreground text-sm">Not tasted yet.</p>
        ) : (
          <div className="flex items-center gap-3">
            {avg_score === null ? (
              <span className="text-muted-foreground text-sm">No score yet</span>
            ) : (
              <span
                role="img"
                aria-label={`${avg_score} average out of 5`}
                className="flex items-baseline gap-1"
              >
                <Star className="size-5 self-center fill-amber-400 text-amber-400" aria-hidden />
                <span className="font-semibold text-2xl tabular-nums">{avg_score}</span>
                <span className="text-muted-foreground text-sm">/ 5</span>
              </span>
            )}
            <span className="text-muted-foreground text-sm">
              {count === 1 ? "1 tasting" : `${count} tastings`}
              {last_tasted_on && (
                <>
                  <br />
                  last {formatDate(last_tasted_on)}
                </>
              )}
            </span>
          </div>
        )}
        {canEdit && (
          <Button
            size="sm"
            onClick={(): void =>
              setTarget({
                kind: "new",
                bottle: { id: product.id, name: product.name, status: product.status },
              })
            }
          >
            <Plus aria-hidden />
            Add tasting
          </Button>
        )}
      </div>
      {list}
      {count > RECENT_TASTINGS && (
        <Link
          to="/tastings"
          search={{ product: product.id }}
          className="self-start text-brand text-sm hover:underline"
        >
          See all {count} tastings
        </Link>
      )}
      <TastingSheet barId={bar.id} target={target} onClose={(): void => setTarget(null)} />
    </div>
  );
}
