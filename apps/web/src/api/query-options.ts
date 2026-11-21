import type { Page } from "@larder/shared";
import type {
  InfiniteData,
  infiniteQueryOptions,
  QueryKey,
  queryOptions,
} from "@tanstack/react-query";

// Keep the data tags used by TanStack Query to infer cache reads and writes from a query key.
export type ApiQueryOptions<T, TKey extends QueryKey = QueryKey> = ReturnType<
  typeof queryOptions<T, Error, T, TKey>
>;

export type ApiInfiniteQueryOptions<
  T,
  TPageParam extends string | undefined,
  TKey extends QueryKey = QueryKey,
> = ReturnType<
  typeof infiniteQueryOptions<Page<T>, Error, InfiniteData<Page<T>>, TKey, TPageParam>
>;
