import type { Query, QueryClient } from "@tanstack/react-query";

type QueryKeyPrefix = readonly unknown[];
/** What a set of cached queries held before an optimistic change, for rolling it back. */
export type Snapshot<T> = [QueryKeyPrefix, T][];

const isCached = <T>(entry: [QueryKeyPrefix, T | undefined]): entry is [QueryKeyPrefix, T] =>
  entry[1] !== undefined;

/** Applies `update` to every cached query under `prefix`; returns the previous data. */
export function patchQueries<T>(
  client: QueryClient,
  prefix: QueryKeyPrefix,
  update: (data: T) => T,
): Snapshot<T> {
  const snapshot: Snapshot<T> = client.getQueriesData<T>({ queryKey: prefix }).filter(isCached);
  for (const [key, data] of snapshot) client.setQueryData<T>(key, update(data));
  return snapshot;
}

export function restoreQueries<T>(client: QueryClient, snapshot: Snapshot<T>): void {
  for (const [key, data] of snapshot) client.setQueryData<T>(key, data);
}

/** A list query showing only favourites: list keys end with their filters. */
export const isFavouritesList = ({ queryKey }: Pick<Query, "queryKey">): boolean =>
  (queryKey.at(-1) as { favourite?: boolean }).favourite === true;
