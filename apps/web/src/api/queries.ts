import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./client.ts";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => unwrap(await api.api.me.$get()),
});

export const useMe = () => useQuery(meQuery);
