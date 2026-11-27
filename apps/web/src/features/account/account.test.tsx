import { SESSION_REQUEST_HEADER } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { failure } from "@/test/fixtures.ts";
import { meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

it("requires sign-in, shows credential errors, and returns to the requested page", async () => {
  let signedIn = false;
  server.use(
    http.get("/api/me", () =>
      signedIn ? HttpResponse.json(meFixture) : failure("UNAUTHORIZED", 401, "Sign in"),
    ),
    http.post("/api/auth/sign-in", async ({ request }) => {
      expect(request.headers.get(SESSION_REQUEST_HEADER)).toBe("1");
      const payload = await request.json();
      if (!payload || (payload as { password: string }).password !== "correct password") {
        return failure("UNAUTHORIZED", 401, "Invalid email or password");
      }
      signedIn = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, router, queryClient } = renderWithProviders("/bottles");
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Email"), "OWNER@larder.local");
  const password = screen.getByLabelText("Password");
  await user.type(password, "bad password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  await user.clear(password);
  await user.type(password, "correct password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("heading", { name: "Bottles" })).toBeVisible();
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  expect(router.state.location.pathname).toBe("/bottles");
});

it("can sign out from the top bar, retry a failure, and clear signed-in data", async () => {
  let signedIn = true;
  server.use(
    http.get("/api/me", () =>
      signedIn ? HttpResponse.json(meFixture) : failure("UNAUTHORIZED", 401, "Sign in"),
    ),
    http.post("/api/auth/sign-out", () => failure("INTERNAL", 500, "Try again"), { once: true }),
    http.post("/api/auth/sign-out", () => {
      signedIn = false;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, queryClient } = renderWithProviders("/cocktails");
  queryClient.setQueryData(["bar-content"], "private");
  const header = await screen.findByRole("banner");
  const button = within(header).getByRole("button", { name: "Sign out" });
  await user.click(button);
  expect(await screen.findByText("Could not sign out")).toBeVisible();
  await user.click(button);
  await waitFor(() => expect(queryClient.getQueryData(["bar-content"])).toBeUndefined());
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
});
