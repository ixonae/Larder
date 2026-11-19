import { IMAGE_MIME_TYPES, type ImageEntity, imageUrl } from "@larder/shared";
import { Camera, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { type ImageChange, KEEP_IMAGE, useSaveImage } from "@/api/images.ts";
import { toast } from "@/components/toaster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";

/** The local preview of a picked file, released when it is replaced or the field goes away. */
function usePreview(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

/**
 * The picture field of a form. Nothing is sent while editing: the form applies the change once the
 * item is saved, so it also works for an item that does not exist yet. On phones the picker offers
 * the camera or the photo library.
 */
export function ImageUpload({
  imageId,
  value,
  onChange,
}: {
  /** The saved picture, if any. */
  imageId: string | null;
  value: ImageChange;
  onChange: (change: ImageChange) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const preview = usePreview(value.kind === "replace" ? value.file : null);
  const shown = preview ?? (value.kind === "keep" && imageId ? imageUrl(imageId) : null);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Picture</Label>
      <div className="flex items-center gap-3">
        {shown ? (
          <img src={shown} alt="Preview" className="size-20 rounded-md object-cover" />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs">
            None
          </span>
        )}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (input.current as HTMLInputElement).click()}
          >
            <Camera aria-hidden />
            {shown ? "Replace" : "Add picture"}
          </Button>
          {shown && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(imageId ? { kind: "remove" } : { kind: "keep" })}
            >
              <Trash2 aria-hidden />
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={IMAGE_MIME_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = (e.target.files as FileList)[0];
          if (file) onChange({ kind: "replace", file });
          // Picking the same file again should still count as a change.
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * State for an `ImageUpload` field, and `apply(id, saved)` to run once the item is saved: it toasts
 * `saved` when the picture change went through too. It never throws: a failed upload is reported in
 * a toast instead, and the item itself stays saved.
 */
export function useImageField(barId: string, entity: ImageEntity) {
  const [change, setChange] = useState<ImageChange>(KEEP_IMAGE);
  const save = useSaveImage(barId, entity);
  const apply = async (id: string, saved: string) => {
    try {
      await save(id, change);
      toast(saved);
    } catch (err) {
      toast("Could not save the picture", {
        description: (err as Error).message,
        variant: "error",
      });
    }
  };
  return { change, setChange, apply };
}
