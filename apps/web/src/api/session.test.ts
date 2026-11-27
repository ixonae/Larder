import { expect, it, vi } from "vitest";
import { meFixture } from "@/test/msw.ts";
import { meQuery } from "./queries.ts";
import { createQueryClient } from "./query-client.ts";
import { notifySessionChange, watchSession } from "./session.ts";

it("releases private queries and mutations when another tab changes the cookie", async () => {
  const client = createQueryClient();
  client.setQueryData(meQuery.queryKey, meFixture);
  client.setQueryData(["journal"], ["private tasting"]);
  await client
    .getMutationCache()
    .build(client, { mutationFn: async () => "private result" })
    .execute(undefined);
  const restart = vi.fn();
  const stop = watchSession(client, restart);
  window.dispatchEvent(new StorageEvent("storage", { key: "larder.theme" }));
  expect(restart).not.toHaveBeenCalled();
  notifySessionChange();
  expect(localStorage.getItem("larder.session-changed")).toBeTruthy();
  window.dispatchEvent(new StorageEvent("storage", { key: "larder.session-changed" }));
  expect(restart).toHaveBeenCalledOnce();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  stop();
});

it("still detects a passive session expiry when storage is disabled", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage disabled");
  });
  notifySessionChange();
  const client = createQueryClient();
  client.setQueryData(meQuery.queryKey, meFixture);
  client.setQueryData(["journal"], ["private tasting"]);
  const restart = vi.fn();
  watchSession(client, restart);
  await client.fetchQuery({ ...meQuery, queryFn: () => Promise.resolve(null) });
  expect(restart).toHaveBeenCalledOnce();
  expect(client.getQueryData(["journal"])).toBeUndefined();
});
