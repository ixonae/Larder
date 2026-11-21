import { cn } from "cn";
import { Heart } from "lucide-react";
import type { ReactElement } from "react";

/** A heart that adds a bottle or cocktail to your favourites or removes it; at least 44px to tap. */
export function FavouriteButton({
  favourite,
  onToggle,
  className,
  disabled,
}: Readonly<{
  favourite: boolean;
  onToggle: (favourite: boolean) => void;
  className?: string;
  disabled?: boolean;
}>): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted",
        className,
      )}
      onClick={(): void => onToggle(!favourite)}
    >
      <Heart
        className={cn("size-5", favourite ? "fill-red-500 text-red-500" : "text-muted-foreground")}
        aria-hidden
      />
    </button>
  );
}
