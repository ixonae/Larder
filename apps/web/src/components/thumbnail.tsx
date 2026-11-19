import { imageUrl } from "@larder/shared";
import { cn } from "cn";
import { ImageOff } from "lucide-react";

/** A square thumbnail of the item's picture, or a quiet placeholder when it has none. */
export function Thumbnail({ imageId, className }: { imageId: string | null; className?: string }) {
  const box = cn("size-10 shrink-0 rounded-md bg-muted object-cover", className);
  if (!imageId) {
    return (
      <span className={cn(box, "flex items-center justify-center")} aria-hidden>
        <ImageOff className="size-4 text-muted-foreground/60" />
      </span>
    );
  }
  // Decorative next to the item's name; lazy so long lists only load what is on screen.
  return <img src={imageUrl(imageId, "thumb")} alt="" loading="lazy" className={box} />;
}
