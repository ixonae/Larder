import { MutationCache, QueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "./client.ts";

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

export function createQueryClient() {
  const client: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry } },
    mutationCache: new MutationCache({
      // Not awaited: the mutation settles (and runs its own cache updates) without waiting for
      // dependent screens to refetch. The queries are marked stale synchronously.
      onSuccess: (_data, _variables, _context, mutation) => {
        for (const queryKey of mutation.meta?.invalidates ?? []) {
          void client.invalidateQueries({ queryKey });
        }
      },
    }),
  });
  return client;
}
