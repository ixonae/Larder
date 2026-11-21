import type { ImageEntity } from "@larder/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";

const bar: (typeof api.api.bars)[":barId"] = api.api.bars[":barId"];

/** The `/:id/image` endpoints of one kind of item; they have the same shape for every kind. */
const imageEndpoint = (entity: ImageEntity): (typeof bar)[ImageEntity][":id"]["image"] =>
  bar[entity][":id"].image;

/** What a form asks for the item's picture once the item itself is saved. */
export type ImageChange = { kind: "keep" } | { kind: "replace"; file: File } | { kind: "remove" };
export const KEEP_IMAGE: ImageChange = { kind: "keep" };

/**
 * Applies an `ImageChange` to a saved item. Every query of the bar is refreshed afterwards: lists and
 * detail pages show the picture.
 */
export function useSaveImage(
  barId: string,
  entity: ImageEntity,
): (id: string, change: ImageChange) => Promise<void> {
  const queryClient = useQueryClient();
  const mutation = useMutation<void, Error, { id: string; change: ImageChange }>({
    mutationFn: async ({ id, change }: { id: string; change: ImageChange }) => {
      if (change.kind === "replace") {
        await unwrap(
          await imageEndpoint(entity).$put({ param: { barId, id }, form: { file: change.file } }),
        );
      } else if (change.kind === "remove") {
        await unwrap(await imageEndpoint(entity).$delete({ param: { barId, id } }));
      }
    },
    onSettled: (_data: unknown, _error: Error | null, { change }: { change: ImageChange }) =>
      change.kind === "keep"
        ? undefined
        : queryClient.invalidateQueries({ queryKey: ["bars", barId] }),
  });
  return (id: string, change: ImageChange): Promise<void> => mutation.mutateAsync({ id, change });
}
