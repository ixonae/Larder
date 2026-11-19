import { z } from "zod";

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/** `?limit=&cursor=` query parameters accepted by every list endpoint. */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().min(1).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** A boolean query parameter, written `true` or `false`. */
export const booleanQuerySchema = z.stringbool({ truthy: ["true"], falsy: ["false"] });

/** A page of results; `next_cursor` is null on the last page. */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    next_cursor: z.string().nullable(),
  });
}
export type Page<T> = { items: T[]; next_cursor: string | null };
