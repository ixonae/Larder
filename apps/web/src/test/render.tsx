import type { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import type { RenderResult } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";
import { createQueryClient } from "@/api/query-client.ts";
import { App } from "@/app.tsx";
import { createAppRouter } from "@/routes/router.tsx";

const newClient = (): QueryClient => {
  const client = createQueryClient();
  client.setDefaultOptions({ ...client.getDefaultOptions(), queries: { retry: false } });
  return client;
};
// Recreate the document's React tree on a session change; jsdom cannot navigate a real page.
function TestApp({
  queryClient,
  router,
}: {
  queryClient: QueryClient;
  router: ReturnType<typeof createAppRouter>;
}): JSX.Element {
  const [session, setSession] = useState({ queryClient, generation: 0 });
  return (
    <App
      key={session.generation}
      queryClient={session.queryClient}
      router={router}
      restart={(): void =>
        setSession({ queryClient: newClient(), generation: session.generation + 1 })
      }
    />
  );
}

/**
 * Renders the whole app at `path` with the app's query client (fresh cache, no retries) and in-memory
 * history.
 */
export function renderWithProviders(path = "/"): RenderResult & {
  router: ReturnType<typeof createAppRouter>;
  user: UserEvent;
  queryClient: QueryClient;
} {
  const queryClient = newClient();
  const router = createAppRouter({ queryClient }, createMemoryHistory({ initialEntries: [path] }));
  const user = userEvent.setup();
  return {
    ...render(<TestApp queryClient={queryClient} router={router} />),
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
