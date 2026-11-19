import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/app.tsx";
import { createAppRouter } from "@/routes/router.tsx";

/** Renders the whole app at `path` with a fresh query cache (no retries) and in-memory history. */
export function renderWithProviders(path = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter({ queryClient }, createMemoryHistory({ initialEntries: [path] }));
  const user = userEvent.setup();
  return {
    ...render(<App queryClient={queryClient} router={router} />),
    router,
    user,
    queryClient,
  };
}
