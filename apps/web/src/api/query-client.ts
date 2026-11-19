import { QueryClient } from "@tanstack/react-query";
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

export const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
