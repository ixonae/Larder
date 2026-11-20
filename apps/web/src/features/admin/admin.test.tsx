import type { AdminUser, SignupSettings } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { failure } from "@/test/fixtures.ts";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

const guest = {
  id: "01a1f326-d941-7d74-8a40-504a488cd392",
  email: "alex@example.com",
  display_name: "Alex",
  is_admin: false,
  disabled: false,
  last_login_at: null,
} satisfies AdminUser;
const admin = { ...meFixture.user, disabled: false, last_login_at: null };
const base = "/api/admin";

it("shows installation controls only to installation admins", async () => {
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        ...meFixture,
        user: { ...meFixture.user, is_admin: false },
      }),
    ),
  );
  const { user, router } = renderWithProviders("/bars");
  expect(
    await screen.findByText("Can edit recipes, inventory, and the bar catalogue."),
  ).toBeVisible();
  const sidebar = within(screen.getByRole("navigation", { name: "Account navigation" }));
  expect(sidebar.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
  await user.click(sidebar.getByRole("link", { name: "Account" }));
  expect(await screen.findByRole("heading", { name: "Account settings" })).toBeVisible();
  await router.navigate({ to: "/admin" });
  expect(await screen.findByText("Admin access required")).toBeVisible();
});

it("recovers from loading errors and manages signup and user access", async () => {
  let policy: SignupSettings = { signup_mode: "invite_only" };
  let target: AdminUser = guest;
  server.use(
    http.get(`${base}/users`, () => failure("INTERNAL", 500, "Administration unavailable"), {
      once: true,
    }),
    http.get("/api/auth/signup-settings", () => HttpResponse.json(policy)),
    http.get(`${base}/users`, () => HttpResponse.json({ users: [admin, target] })),
    http.get(`${base}/bars`, () => HttpResponse.json({ bars: [] })),
    http.patch(`${base}/signup-settings`, () => failure("INTERNAL", 500, "Policy unchanged"), {
      once: true,
    }),
    http.patch(`${base}/signup-settings`, async ({ request }) => {
      policy = (await request.json()) as SignupSettings;
      return HttpResponse.json(policy);
    }),
    http.patch(`${base}/users/${guest.id}`, () => failure("INTERNAL", 500, "User unchanged"), {
      once: true,
    }),
    http.patch(`${base}/users/${guest.id}`, async ({ request }) => {
      const patch = (await request.json()) as { disabled: boolean };
      target = { ...target, ...patch };
      return HttpResponse.json(target);
    }),
  );
  const { user } = renderWithProviders("/bars");
  await user.click(await screen.findByRole("link", { name: "Administration" }));
  expect(await screen.findByText("Administration unavailable")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "User accounts" })).toBeVisible();
  const search = screen.getByRole("searchbox", { name: "Search users" });
  await user.type(search, "nobody");
  expect(screen.getByText("No matching users")).toBeVisible();
  await user.clear(search);
  await user.type(search, "example.com");
  expect(screen.getByText(guest.email)).toBeVisible();
  expect(screen.queryByText(admin.email)).not.toBeInTheDocument();
  await user.clear(search);
  expect(screen.queryByRole("button", { name: "Manage Owner" })).not.toBeInTheDocument();
  const manage = screen.getByRole("button", { name: "Manage Alex" });
  const action = async (name: string) => {
    await user.click(manage);
    await user.click(await screen.findByRole("menuitem", { name }));
  };
  await action("Disable account");
  expect(await screen.findByText("User unchanged")).toBeVisible();
  await action("Disable account");
  expect(await screen.findByText("Disabled")).toBeVisible();
  await action("Enable account");
  expect(await screen.findByText("Active")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "Signup policy" }));
  await user.click(await screen.findByRole("radio", { name: "Admins only" }));
  const save = screen.getByRole("button", { name: "Save signup policy" });
  await user.click(save);
  expect(await screen.findByText("Policy unchanged")).toBeVisible();
  await user.click(save);
  expect(await screen.findByText("Signup policy updated.")).toBeVisible();
  expect(policy.signup_mode).toBe("closed");
});

it("creates users and confirms deletion of a bar in the installation directory", async () => {
  let barExists = true;
  let accounts: AdminUser[] = [admin];
  server.use(
    http.get(`${base}/signup-settings`, () => HttpResponse.json({ signup_mode: "closed" })),
    http.get(`${base}/users`, () => HttpResponse.json({ users: accounts })),
    http.get(`${base}/bars`, () =>
      HttpResponse.json({
        bars: barExists
          ? [
              {
                id: BAR_ID,
                name: "Home bar",
                owner: { id: admin.id, display_name: admin.display_name },
              },
            ]
          : [],
      }),
    ),
    http.post(`${base}/users`, async ({ request }) => {
      expect(await request.json()).toEqual({
        display_name: "Alex",
        email: guest.email,
        password: "the initial password",
      });
      accounts = [...accounts, guest];
      return HttpResponse.json(guest, { status: 201 });
    }),
    http.delete(`${base}/bars/${BAR_ID}`, async ({ request }) => {
      expect(await request.json()).toEqual({ name: "Home bar" });
      barExists = false;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/admin");
  await user.click(await screen.findByRole("button", { name: "Add user" }));
  await user.type(await screen.findByLabelText("Display name"), "Alex");
  await user.type(screen.getByLabelText("Email"), guest.email);
  await user.type(screen.getByLabelText("Password"), "the initial password");
  await user.click(screen.getByRole("button", { name: "Create user" }));
  expect(await screen.findByText(guest.email)).toBeVisible();

  await user.click(screen.getByRole("tab", { name: "Bars" }));
  const remove = await screen.findByRole("button", { name: "Delete Home bar" });
  await user.click(remove);
  const dialog = within(await screen.findByRole("alertdialog", { name: "Delete Home bar?" }));
  const name = dialog.getByRole("textbox", { name: /to confirm/ });
  await user.type(name, "Home bar");
  await user.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(barExists).toBe(true);
  await user.click(remove);
  const reopened = within(await screen.findByRole("alertdialog"));
  expect(reopened.getByRole("textbox", { name: /to confirm/ })).toHaveValue("");
  const confirm = reopened.getByRole("button", { name: "Delete bar" });
  expect(confirm).toBeDisabled();
  await user.type(reopened.getByRole("textbox", { name: /to confirm/ }), "Home bar");
  await user.click(confirm);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Delete Home bar" })).not.toBeInTheDocument(),
  );
});

it("shows the last sign-in and requires the exact email before deleting an account", async () => {
  const lastLogin = "2026-11-19T15:30:00.000Z";
  const signedInGuest = { ...guest, last_login_at: lastLogin };
  let users = [admin, signedInGuest];
  server.use(
    http.get(`${base}/users`, () => HttpResponse.json({ users })),
    http.delete(
      `${base}/users/${guest.id}`,
      async ({ request }) => {
        expect(await request.json()).toEqual({ email: guest.email });
        return failure("CONFLICT", 409, "This user owns a bar.", {
          used_by: [{ type: "bar", id: BAR_ID, name: "Home bar" }],
        });
      },
      { once: true },
    ),
    http.delete(`${base}/users/${guest.id}`, async ({ request }) => {
      expect(await request.json()).toEqual({ email: guest.email });
      users = [admin];
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/admin");
  expect(await screen.findByText("No recorded sign-in")).toBeVisible();
  expect(screen.getByText(/Last sign-in/).querySelector("time")).toHaveAttribute(
    "datetime",
    lastLogin,
  );
  const remove = async () => {
    await user.click(screen.getByRole("button", { name: "Manage Alex" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete account" }));
    const dialog = within(await screen.findByRole("alertdialog", { name: "Delete Alex?" }));
    const email = dialog.getByRole("textbox", { name: /to confirm/ });
    const confirm = dialog.getByRole("button", { name: "Delete account" });
    await user.type(email, "other@example.com");
    expect(confirm).toBeDisabled();
    await user.clear(email);
    await user.type(email, guest.email);
    await user.click(confirm);
    return dialog;
  };
  const dialog = await remove();
  const alert = await dialog.findByRole("alert");
  expect(alert).toHaveTextContent("This user owns a bar.");
  expect(within(alert).getByRole("listitem")).toHaveTextContent("Home bar (Bar)");
  await user.click(dialog.getByRole("button", { name: "Close" }));
  await remove();
  await waitFor(() => expect(screen.queryByText(guest.email)).not.toBeInTheDocument());
});

it("validates and resets a user's password from their action menu", async () => {
  const replacement = "a long replacement password";
  server.use(
    http.get(`${base}/users`, () => HttpResponse.json({ users: [admin, guest] })),
    http.patch(
      `${base}/users/${guest.id}/password`,
      () => failure("INTERNAL", 500, "Reset failed"),
      { once: true },
    ),
    http.patch(`${base}/users/${guest.id}/password`, async ({ request }) => {
      expect(await request.json()).toEqual({
        new_password: replacement,
        confirm_password: replacement,
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/admin");
  await user.click(await screen.findByRole("button", { name: "Manage Alex" }));
  await user.click(await screen.findByRole("menuitem", { name: "Reset password" }));
  const sheet = within(await screen.findByRole("dialog", { name: "Reset password for Alex" }));
  const confirm = sheet.getByRole("button", { name: "Reset password" });
  const confirmation = sheet.getByLabelText("Confirm new password");
  await user.type(sheet.getByLabelText("New password", { exact: true }), replacement);
  await user.type(confirmation, "wrong");
  await user.click(confirm);
  expect(await sheet.findByText("Passwords must match.")).toBeVisible();
  await user.clear(confirmation);
  await user.type(confirmation, replacement);
  await user.click(confirm);
  expect(await sheet.findByText("Reset failed")).toBeVisible();
  await user.click(confirm);
  expect(await screen.findByText("Password reset for Alex")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
