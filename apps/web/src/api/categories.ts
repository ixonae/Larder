import { type CreateCategory, categoryTreeSchema, type UpdateCategory } from "@larder/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";

const bar = api.api.bars[":barId"];

export const categoriesKey = (barId: string) => ["bars", barId, "categories"] as const;

/**
 * The whole category tree of a bar. Hono's RPC types cannot express the recursive `children`, so the
 * body is typed (and checked) with the shared schema.
 */
export const categoryTreeQuery = (barId: string) =>
  queryOptions({
    queryKey: [...categoriesKey(barId), "tree"],
    queryFn: async () => {
      const res = await bar.categories.tree.$get({ param: { barId } });
      return categoryTreeSchema.parse(await unwrap<unknown>(res)).items;
    },
  });

/**
 * Create, update and delete. Each refreshes every query of the bar, not only the categories: bottles
 * carry their category's name.
 */
export function useCategoryMutations(barId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ["bars", barId] });
  return {
    create: useMutation({
      mutationFn: async (json: CreateCategory) =>
        unwrap(await bar.categories.$post({ param: { barId }, json })),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: async ({ id, json }: { id: string; json: UpdateCategory }) =>
        unwrap(await bar.categories[":id"].$patch({ param: { barId, id }, json })),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (id: string) =>
        unwrap(await bar.categories[":id"].$delete({ param: { barId, id } })),
      onSuccess,
    }),
  };
}
