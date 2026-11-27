import { screen } from "@testing-library/react";
import { HttpResponse, http, type JsonBodyType } from "msw";
import { expect, it } from "vitest";
import { failure } from "@/test/fixtures.ts";
import { meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

const guest = (): HttpResponse<JsonBodyType> => failure("UNAUTHORIZED", 401, "Sign in");

it("offers public registration when enabled and takes the new user to Bars", async () => {
  let authenticated = false;
  server.use(
    http.get("/api/me", () =>
      authenticated ? HttpResponse.json({ ...meFixture, bars: [] }) : guest(),
    ),
    http.get("/api/auth/signup-settings", () => HttpResponse.json({ signup_mode: "open" })),
    http.post("/api/auth/sign-up", async ({ request }) => {
      expect(await request.json()).toEqual({
        display_name: "Alex",
        email: "alex@example.com",
        password: "a long new password",
      });
      authenticated = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, queryClient } = renderWithProviders("/cocktails");
  await user.click(await screen.findByRole("link", { name: "Create an account" }));
  await user.type(await screen.findByLabelText("Display name"), "Alex");
  await user.type(screen.getByLabelText("Email"), "alex@example.com");
  await user.type(screen.getByLabelText("Password"), "a long new password");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("heading", { name: /^Bars$/ })).toBeVisible();
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
});

it("recovers when signup policy cannot load and hides the form when signup is closed", async () => {
  server.use(
    http.get("/api/me", guest),
    http.get("/api/auth/signup-settings", () => failure("INTERNAL", 500, "Policy unavailable"), {
      once: true,
    }),
    http.get("/api/auth/signup-settings", () => HttpResponse.json({ signup_mode: "closed" })),
  );
  const { user } = renderWithProviders("/signup");
  expect(await screen.findByText("Policy unavailable")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Public signup is closed.")).toBeVisible();
  expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
});

it("keeps an existing session when the signup page is opened already signed in", async () => {
  server.use(
    http.get("/api/auth/signup-settings", () => HttpResponse.json({ signup_mode: "open" })),
  );
  renderWithProviders("/signup");
  expect(await screen.findByText("You’re already signed in.")).toBeVisible();
  expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
});
