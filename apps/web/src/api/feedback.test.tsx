import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { Toaster } from "@/components/toaster.tsx";
import { BAR_ID } from "@/test/msw.ts";
import { useSetFavourite, useSetRating } from "./feedback.ts";

/** A client whose `cancelQueries` fails, so the mutation's `onMutate` throws before it snapshots. */
function brokenClient(): QueryClient {
  const client: QueryClient = new QueryClient();
  vi.spyOn(client, "cancelQueries").mockRejectedValue(new Error("Offline"));
  return client;
}

function wrapperFor(client: QueryClient): ({ children }: { children: ReactNode }) => ReactElement {
  return ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

it("reports a failed rating even when nothing could be snapshotted", async () => {
  const { result } = renderHook(() => useSetRating(BAR_ID, "c1"), {
    wrapper: wrapperFor(brokenClient()),
  });
  act(() => result.current.mutate({ score: 4 }));
  expect(await screen.findByText("Could not save your rating")).toBeInTheDocument();
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it("reports a failed favourite even when nothing could be snapshotted", async () => {
  const { result } = renderHook(() => useSetFavourite(BAR_ID), {
    wrapper: wrapperFor(brokenClient()),
  });
  act(() => result.current.mutate({ id: "c1", favourite: true }));
  expect(await screen.findByText("Could not update your favourites")).toBeInTheDocument();
  await waitFor(() => expect(result.current.isError).toBe(true));
});
