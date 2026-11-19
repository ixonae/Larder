import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

describe("AppShell", () => {
  it("redirects / to the cocktails page", async () => {
    const { router } = renderWithProviders("/");
    expect(await screen.findByRole("heading", { name: "Cocktails" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/cocktails");
  });

  it("renders both navigations with every section", async () => {
    renderWithProviders("/cocktails");
    for (const name of ["Sidebar", "Bottom navigation"]) {
      const nav = await screen.findByRole("navigation", { name });
      const links = within(nav).getAllByRole("link");
      expect(links.map((l) => l.textContent)).toEqual([
        "Cocktails",
        "Bottles",
        "Pantry",
        "Utensils",
        "Categories",
      ]);
    }
  });

  it("shows the current bar name from the API", async () => {
    renderWithProviders("/cocktails");
    await waitFor(() => expect(screen.getByTestId("bar-name")).toHaveTextContent("Home bar"));
  });

  it("says when the user has no bar", async () => {
    server.use(http.get("/api/me", () => HttpResponse.json({ ...meFixture, bars: [] })));
    renderWithProviders("/cocktails");
    await waitFor(() => expect(screen.getByTestId("bar-name")).toHaveTextContent("No bar"));
  });

  it("navigates between sections and marks the active link", async () => {
    const { user, router } = renderWithProviders("/cocktails");
    const nav = await screen.findByRole("navigation", { name: "Bottom navigation" });
    await user.click(within(nav).getByRole("link", { name: "Bottles" }));
    expect(await screen.findByRole("heading", { name: "Bottles" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/bottles");
    expect(within(nav).getByRole("link", { name: "Bottles" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const side = screen.getByRole("navigation", { name: "Sidebar" });
    for (const name of ["Pantry", "Categories", "Utensils", "Cocktails"]) {
      await user.click(within(side).getByRole("link", { name }));
      expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("shows a not-found page for unknown routes", async () => {
    renderWithProviders("/nope");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("displays the API error and recovers on retry", async () => {
    server.use(
      http.get(
        "/api/me",
        () =>
          HttpResponse.json(
            { error: { code: "INTERNAL", message: "Database is locked" } },
            { status: 500 },
          ),
        { once: true },
      ),
    );
    const { user } = renderWithProviders("/cocktails");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Database is locked");

    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Cocktails" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
