import { expect, test } from "@playwright/test";

test("health check answers ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("the app loads and navigates", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Larder");
  await expect(page.getByRole("heading", { name: "Cocktails" })).toBeVisible();
  await expect(page.getByTestId("bar-name")).toHaveText("My bar");

  const nav = page.getByRole("navigation", { name: isMobile ? "Bottom navigation" : "Sidebar" });
  await nav.getByRole("link", { name: "Bottles" }).click();
  await expect(page.getByRole("heading", { name: "Bottles" })).toBeVisible();
  await expect(page).toHaveURL(/\/bottles$/);

  // Client-side routes survive a reload (the server falls back to index.html).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bottles" })).toBeVisible();
});
