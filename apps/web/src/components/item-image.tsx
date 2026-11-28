import { type ImageSize, imageUrl } from "@larder/shared";
import { type ComponentProps, type JSX, useState } from "react";

type ItemImageProps = Omit<ComponentProps<"img">, "src" | "onError" | "alt"> & {
  imageId: string;
  size: ImageSize;
  artworkKey?: string | null;
  alt: string;
};

/** A cached query may still name artwork retired by a new deployment. */
export function ItemImage({
  imageId,
  size,
  artworkKey,
  alt,
  ...props
}: ItemImageProps): JSX.Element {
  const [failedArtwork, setFailedArtwork] = useState<string | null>(null);
  const artworkUrl = artworkKey ? imageUrl(imageId, size, artworkKey) : null;
  const useArtwork = artworkUrl !== null && artworkUrl !== failedArtwork;
  return (
    <img
      {...props}
      alt={alt}
      src={useArtwork ? artworkUrl : imageUrl(imageId, size)}
      onError={useArtwork ? () => setFailedArtwork(artworkUrl) : undefined}
    />
  );
}
