import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async ({ signal }) => {
    const response = await api.api.me.$get(undefined, { init: { signal } });
    const status: number = response.status;
    return status === 401 ? null : unwrap(response);
  },
});

export const useMe = () => useQuery(meQuery);

/** Install-wide and rarely changed; the admin page writes saves straight into the cache. */
export const signupSettingsQuery = queryOptions({
  queryKey: ["signup-settings"],
  staleTime: 5 * 60_000,
  queryFn: async () => unwrap(await api.api.auth["signup-settings"].$get()),
});
