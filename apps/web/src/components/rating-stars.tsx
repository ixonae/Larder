import { cn } from "cn";
import { Star } from "lucide-react";
import { useId } from "react";

const SCORES = [1, 2, 3, 4, 5] as const;

const starClass = (filled: boolean) =>
  cn("size-5", filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground");

/**
 * A 1–5 star rating. Without `onChange` it only displays the value. With it, the stars are radio
 * buttons (keyboard friendly); picking the current score again clears the rating.
 */
export function RatingStars({
  value,
  onChange,
  label = "Rating",
}: Readonly<{
  value: number | null;
  onChange?: (value: number | null) => void;
  label?: string;
}>) {
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
          className="cursor-pointer p-1 has-focus-visible:ring-2 has-focus-visible:ring-ring"
        >
          <input
            type="radio"
            name={name}
            value={s}
            checked={value === s}
            aria-label={`${s} star${s > 1 ? "s" : ""}`}
            className="sr-only"
            onChange={() => onChange(s)}
            onClick={() => {
              if (value === s) onChange(null);
            }}
          />
          <Star className={starClass(value !== null && s <= value)} aria-hidden />
        </label>
      ))}
    </fieldset>
  );
}
