import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { failure } from "@/test/fixtures.ts";
import { meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

describe("AppShell", () => {
  it("redirects / to the cocktails page", async () => {
    const { router } = renderWithProviders("/");
    expect(await screen.findByRole("heading", { name: "Cocktails" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/cocktails");
  });

  it("renders both navigations, keeping Tastings out of the phone's five tabs", async () => {
    renderWithProviders("/cocktails");
    const names = async (name: string): Promise<string[]> =>
      within(await screen.findByRole("navigation", { name }))
        .getAllByRole("link")
        .map((l) => l.textContent);
    expect(await names("Sidebar")).toEqual([
      "Cocktails",
      "Bottles",
      "Tastings",
      "Pantry",
      "Utensils",
      "Categories",
    ]);
    expect(await names("Bottom navigation")).toEqual([
      "Cocktails",
      "Bottles",
      "Pantry",
      "Utensils",
      "Categories",
    ]);
  });

  it("keeps the Bottles tab current on phones while Tastings is open", async () => {
    const { user } = renderWithProviders("/bottles");
    const tabs = await screen.findByRole("navigation", { name: "Bottles section" });
    await user.click(within(tabs).getByRole("link", { name: "Tastings" }));
    expect(await screen.findByRole("heading", { name: "Tastings" })).toBeInTheDocument();
    const current = (name: string, link: string): HTMLElement =>
      within(screen.getByRole("navigation", { name })).getByRole("link", { name: link });
    expect(current("Bottom navigation", "Bottles")).toHaveAttribute("aria-current", "page");
    expect(current("Sidebar", "Tastings")).toHaveAttribute("aria-current", "page");
    expect(current("Sidebar", "Bottles")).not.toHaveAttribute("aria-current");
    // The Tastings page has its own copy of the tabs.
    expect(current("Bottles section", "Tastings")).toHaveAttribute("aria-current", "page");
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
      http.get("/api/me", () => failure("INTERNAL", 500, "Database is locked"), { once: true }),
    );
    const { user } = renderWithProviders("/cocktails");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Database is locked");

    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Cocktails" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
