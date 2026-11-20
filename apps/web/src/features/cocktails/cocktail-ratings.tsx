import type { CocktailDetail, OtherRating, RatingInput } from "@larder/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useSetRating } from "@/api/feedback.ts";
import { RatingStars } from "@/components/rating-stars.tsx";

/** The community average and count next to the stars, or "No ratings yet". */
function Caption({
  average,
  count,
}: Readonly<{ average: number | null; count: number }>): ReactElement {
  if (average === null) return <p className="text-muted-foreground text-sm">No ratings yet</p>;
  return (
    <p
      className="text-muted-foreground text-sm tabular-nums"
      title="Community average. Your own rating is outlined in blue."
    >
      {average.toFixed(1)} ({count})
    </p>
  );
}

function RaterRow({ name, score }: Readonly<{ name: string; score: number }>): ReactElement {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate">{name}</span>
      <RatingStars value={score} />
    </li>
  );
}

/**
 * The rating on the title row: one set of stars showing the community average and your rating.
 */
export function RatingSummary({
  barId,
  recipe,
}: Readonly<{
  barId: string;
  recipe: CocktailDetail;
}>): ReactElement {
  const rate: UseMutationResult<unknown, Error, RatingInput | null> = useSetRating(
    barId,
    recipe.id,
  );
  const mine: CocktailDetail["my_rating"] = recipe.my_rating;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <RatingStars
        label="Your rating"
        value={mine?.score ?? null}
        average={recipe.avg_rating}
        onChange={(score: number | null): void => rate.mutate(score === null ? null : { score })}
      />
      <Caption average={recipe.avg_rating} count={recipe.rating_count} />
    </div>
  );
}

/** Who else rated what, by name. Hidden when nobody else has rated. */
export function CocktailRaters({
  recipe,
}: Readonly<{ recipe: CocktailDetail }>): ReactElement | null {
  const others: OtherRating[] = recipe.other_ratings;
  if (others.length === 0) return null;
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <h2 className="font-semibold text-lg">Ratings</h2>
      <ul aria-label="Raters" className="grid gap-2 text-sm">
        {others.map(
          (rating: OtherRating): ReactElement => (
            <RaterRow key={rating.user.id} name={rating.user.display_name} score={rating.score} />
          ),
        )}
      </ul>
    </section>
  );
}
