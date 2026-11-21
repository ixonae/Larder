import type { Me, SignupSettings } from "@larder/shared";
import { queryOptions, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";

import type { ApiQueryOptions } from "./query-options.ts";

export const meQuery: ApiQueryOptions<Me | null, string[]> = queryOptions({
  queryKey: ["me"],
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    const response = await api.api.me.$get(undefined, { init: { signal } });
    const status: number = response.status;
    return status === 401 ? null : unwrap(response);
  },
});

export const useMe = (): UseQueryResult<Me | null> => useQuery(meQuery);

/** Install-wide and rarely changed; the admin page writes saves straight into the cache. */
export const signupSettingsQuery: ApiQueryOptions<SignupSettings, string[]> = queryOptions({
  queryKey: ["signup-settings"],
  staleTime: 5 * 60_000,
  queryFn: async () => unwrap(await api.api.auth["signup-settings"].$get()),
});
