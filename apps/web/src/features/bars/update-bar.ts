import type { UpdateBar } from "@larder/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client.ts";
import { meQuery } from "@/api/queries.ts";

/** The owner's update of a bar (name and/or currency); refreshes the signed-in user's bars. */
export function useUpdateBar(barId: string, onSaved: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: UpdateBar) =>
      unwrap(await api.api.bars[":barId"].$patch({ param: { barId }, json })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: meQuery.queryKey });
      onSaved();
    },
  });
}
