import type { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import type { RenderResult } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { createQueryClient } from "@/api/query-client.ts";
import { App } from "@/app.tsx";
import { createAppRouter } from "@/routes/router.tsx";

/**
 * Renders the whole app at `path` with the app's query client (fresh cache, no retries) and in-memory
 * history.
 */
export function renderWithProviders(path = "/"): RenderResult & {
  router: ReturnType<typeof createAppRouter>;
  user: UserEvent;
  queryClient: QueryClient;
} {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const router = createAppRouter({ queryClient }, createMemoryHistory({ initialEntries: [path] }));
  const user = userEvent.setup();
  return {
    ...render(<App queryClient={queryClient} router={router} />),
    router,
    user,
    queryClient,
  };
}

/** Anything that can click: a `userEvent.setup()` instance or `userEvent` itself. */
type User = Pick<ReturnType<typeof userEvent.setup>, "click">;

/** Opens a combobox found by its trigger (for pickers repeated per row) and picks an option. */
export async function pick(
  user: User,
  trigger: HTMLElement,
  option: string | RegExp,
): Promise<void> {
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: option }));
}

/** Opens the combobox named `label` and picks the option named `option`. */
export async function choose(
  user: User,
  label: string | RegExp,
  option: string | RegExp,
): Promise<void> {
  await pick(user, screen.getByRole("combobox", { name: label }), option);
}
