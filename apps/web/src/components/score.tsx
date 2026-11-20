import { Star } from "lucide-react";

/** A compact score, "★ 4", for lists where a row of five stars would be noisy. */
export function Score({ value }: Readonly<{ value: number | null }>) {
  if (value === null) return <span className="text-muted-foreground text-sm">No score</span>;
  return (
    <span
      role="img"
      aria-label={`${value} out of 5`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 font-medium text-amber-700 text-sm tabular-nums dark:text-amber-300"
    >
      <Star className="size-3.5 fill-current" aria-hidden />
      {value}
    </span>
  );
}
