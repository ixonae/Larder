import { expect, test } from "@playwright/test";

test("health check answers ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("the app loads and navigates", async ({ page, isMobile }) => {
  const response = await page.goto("/");
  expect(response?.status(), "The web app should serve / at the configured base URL").toBe(200);
  await expect(page).toHaveTitle("Larder");
  const password = process.env.LARDER_TEST_PASSWORD;
  if (!password) throw new Error("Set LARDER_TEST_PASSWORD to the owner password.");
  await page.getByRole("textbox", { name: "Email" }).fill("owner@larder.local");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Cocktails" })).toBeVisible();
  await expect(page.getByTestId("bar-name")).toHaveText("My bar");

  const nav = page.getByRole("navigation", { name: isMobile ? "Bottom navigation" : "Sidebar" });
  await nav.getByRole("link", { name: "Bottles" }).click();
  await expect(page.getByRole("heading", { name: "Bottles" })).toBeVisible();
  await expect(page).toHaveURL(/\/bottles$/);

  // Client-side routes survive a reload (the server falls back to index.html).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bottles" })).toBeVisible();
  await page.getByRole("link", { name: "Manage bars" }).click();
  await expect(page.getByRole("heading", { name: "Bars", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create a bar" })).toBeVisible();
  const deleteSection = page.getByRole("region", { name: "Delete bar" });
  await deleteSection.getByRole("button", { name: "Delete My bar" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete My bar?" });
  const confirmDelete = deleteDialog.getByRole("button", { name: "Delete bar" });
  await expect(confirmDelete).toBeDisabled();
  await deleteDialog.getByRole("textbox", { name: /to confirm/ }).fill("My bar");
  await expect(confirmDelete).toBeEnabled();
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();

  const accountNav = page.getByRole("navigation", { name: "Account navigation" });
  const account = isMobile
    ? page.getByRole("link", { name: "Account settings" })
    : accountNav.getByRole("link", { name: "Account", exact: true });
  await account.click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign-in and security" })).toBeVisible();

  const adminLink = isMobile
    ? page.getByRole("main").getByRole("link", { name: "Administration" })
    : accountNav.getByRole("link", { name: "Administration" });
  await adminLink.click();
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "User accounts" })).toBeVisible();
  await page.getByRole("tab", { name: "Signup policy" }).click();
  await expect(page.getByRole("radio", { name: "Invite only" })).toBeChecked();
  await page.getByRole("tab", { name: "Bars" }).click();
  await expect(page.getByRole("button", { name: "Delete My bar" })).toBeVisible();

  const signOut = page.getByRole("banner").getByRole("button", { name: "Sign out" });
  await signOut.click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
