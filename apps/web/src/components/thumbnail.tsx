import { imageUrl } from "@larder/shared";
import { cn } from "cn";
import { ImageOff, type LucideIcon } from "lucide-react";

/** A square thumbnail of the item's picture, or a quiet placeholder when it has none. */
export function Thumbnail({
  imageId,
  className,
  icon: Icon = ImageOff,
}: {
  imageId: string | null;
  className?: string;
  /** Shown on the placeholder; pick one that hints at what the item is. */
  icon?: LucideIcon;
}) {
  const box = cn("size-10 shrink-0 rounded-md bg-muted object-cover", className);
  if (!imageId) {
    return (
      <span
        className={cn(
          box,
          "flex items-center justify-center bg-gradient-to-br from-brand/10 via-muted to-muted",
        )}
        aria-hidden
      >
        <Icon className="size-[40%] max-h-12 max-w-12 text-brand/45" strokeWidth={1.5} />
      </span>
    );
  }
  // Decorative next to the item's name; lazy so long lists only load what is on screen.
  return <img src={imageUrl(imageId, "thumb")} alt="" loading="lazy" className={box} />;
}
