import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import { expect, it } from "vitest";
import { createQueryClient } from "@/api/query-client.ts";
import { useCredentialSubmit } from "./credential-submit.ts";

it("shows a generic failure for an unexpected rejection without retaining the submitted password", async () => {
  const client = createQueryClient();
  const { result } = renderHook(
    () => useCredentialSubmit((_data: string) => Promise.reject("failed")),
    {
      wrapper: ({ children }: { children: ReactNode }): JSX.Element => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await act(() => result.current.submit("sample password"));
  expect(result.current.error?.message).toBe("Request failed");
  expect(client.getMutationCache().getAll()).toHaveLength(0);
});
