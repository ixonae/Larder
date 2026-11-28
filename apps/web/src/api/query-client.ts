import {
  type Mutation,
  MutationCache,
  type Query,
  QueryCache,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { ApiError } from "./client.ts";
import { meQuery } from "./queries.ts";

export const MAX_RETRIES = 3;

/**
 * Retries network failures and server errors, but not 4xx answers: a 401, 403 or 404 will not change
 * on a second try, and retrying only delays the error screen.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Queries other screens derive from this data: invalidated after any successful run. */
      invalidates?: readonly QueryKey[];
    };
  }
}

/** Back to the sign-in screen: `me` becomes null and every other cached query is dropped. */
export function showSignIn(client: QueryClient): void {
  void client.cancelQueries({ queryKey: meQuery.queryKey });
  client.getMutationCache().clear();
  client.removeQueries({ predicate: (query: Query) => query.queryKey[0] !== meQuery.queryKey[0] });
  client.setQueryData(meQuery.queryKey, null);
}

/** A session that expired or was revoked mid-use sends the user to sign in, wherever it surfaced. */
export function onUnauthorized(client: QueryClient, error: unknown): void {
  if (!(error instanceof ApiError) || error.code !== "UNAUTHORIZED") return;
  if (client.getQueryData(meQuery.queryKey) === null) return; // already signed out (a failed sign-in)
  showSignIn(client);
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // Writes require a live connection. Never queue an offline write for a later session.
    defaultOptions: { queries: { retry: shouldRetry }, mutations: { networkMode: "always" } },
    queryCache: new QueryCache({ onError: (error: Error) => onUnauthorized(client, error) }),
    mutationCache: new MutationCache({
      onError: (error: Error) => onUnauthorized(client, error),
      // Not awaited: the mutation settles (and runs its own cache updates) without waiting for
      // dependent screens to refetch. The queries are marked stale synchronously.
      onSuccess: (
        _data: unknown,
        _variables: unknown,
        _context: unknown,
        mutation: Mutation<unknown, unknown>,
      ) => {
        for (const queryKey of mutation.meta?.invalidates ?? []) {
          void client.invalidateQueries({ queryKey });
        }
      },
    }),
  });
  return client;
}
