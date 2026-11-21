import { cn } from "cn";
import { Star } from "lucide-react";
import type { JSX } from "react";
import { useId } from "react";

const SCORES = [1, 2, 3, 4, 5] as const;

const starClass = (filled: boolean): string =>
  cn("size-5", filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground");

/** One star showing the community fill (amber, partial) under your rating's brand outline. */
function LayeredStar({
  score,
  value,
  average,
}: Readonly<{ score: number; value: number | null; average: number | null }>): JSX.Element {
  const fill: number = average === null ? 0 : Math.min(1, Math.max(0, average - (score - 1)));
  return (
    <span className="relative size-5" aria-hidden>
      <Star className="absolute inset-0 size-5 text-muted-foreground" />
      <span
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${fill * 100}%` }}
      >
        <Star className="size-5 shrink-0 fill-amber-400 text-transparent" />
      </span>
      {value !== null && score <= value && (
        <Star className="absolute inset-0 size-5 text-brand" strokeWidth={2.75} />
      )}
    </span>
  );
}

/**
 * A 1–5 star rating. Without `onChange` it only displays the value. With it, the stars are radio
 * buttons (keyboard friendly); picking the current score again clears the rating.
 *
 * With `average` (interactive mode) the same stars also show a community average: it fills the
 * stars in amber, fractions included, while `value` (your rating) is a thicker brand-coloured
 * outline on top. `average: null` means nobody has rated yet.
 */
export function RatingStars({
  value,
  onChange,
  label = "Rating",
  average,
}: Readonly<{
  value: number | null;
  onChange?: (value: number | null) => void;
  label?: string;
  average?: number | null;
}>): JSX.Element {
  const name = useId();
  if (!onChange) {
    return (
      <div
        role="img"
        aria-label={value === null ? "Not rated" : `${value} out of 5 stars`}
        className="flex"
      >
        {SCORES.map((s) => (
          <Star key={s} className={starClass(value !== null && s <= value)} aria-hidden />
        ))}
      </div>
    );
  }
  return (
    <fieldset className="flex">
      <legend className="sr-only">{label}</legend>
      {SCORES.map((s) => (
        <label
          key={s}
          className="flex h-9 w-7 cursor-pointer items-center justify-center rounded-md has-focus-visible:ring-2 has-focus-visible:ring-ring"
        >
          <input
            type="radio"
            name={name}
            value={s}
            checked={value === s}
            aria-label={`${s} star${s > 1 ? "s" : ""}`}
            className="sr-only"
            onChange={(): void => onChange(s)}
            onClick={(): void => {
              if (value === s) onChange(null);
            }}
          />
          {average === undefined ? (
            <Star className={starClass(value !== null && s <= value)} aria-hidden />
          ) : (
            <LayeredStar score={s} value={value} average={average} />
          )}
        </label>
      ))}
    </fieldset>
  );
}
