import type { BarSummary, PendingInvitation } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { failure, page } from "@/test/fixtures.ts";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { choose, renderWithProviders } from "@/test/render.tsx";

const second: BarSummary = {
  id: "01a1f326-d941-7d74-8a40-504a488cd390",
  name: "Patio",
  currency: "JPY",
  role: "viewer",
};
const pending = {
  id: "01a1f326-d941-7d74-8a40-504a488cd391",
  role: "editor",
  expires_at: "2027-01-01T00:00:00.000Z",
} satisfies PendingInvitation;
const token = "a".repeat(43);
const inviteUrl = `https://bar.example.test/invite#${token}`;
const invitations = `/api/bars/${BAR_ID}/invitations`;
const members = `/api/bars/${BAR_ID}/members`;
const preview = {
  bar_name: second.name,
  can_register: true,
  role: second.role,
  expires_at: pending.expires_at,
};
const guest = () => failure("UNAUTHORIZED", 401, "Sign in");

it("switches bars, remembers the selection, and applies the new role to the UI", async () => {
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({ ...meFixture, bars: [...meFixture.bars, second] }),
    ),
    http.get(`/api/bars/${second.id}/cocktails`, () => page([])),
  );
  const view = renderWithProviders("/cocktails");
  await view.user.click(await screen.findByRole("link", { name: "Manage bars" }));
  expect(await screen.findByRole("heading", { name: "Bars" })).toBeVisible();
  await view.user.click(screen.getByRole("button", { name: "Open Patio" }));
  await waitFor(() => expect(screen.getByTestId("bar-name")).toHaveTextContent("Patio"));
  expect(await screen.findByRole("heading", { name: "Cocktails" })).toBeVisible();
  expect(screen.queryByRole("link", { name: /New cocktail/ })).not.toBeInTheDocument();
  view.unmount();
  renderWithProviders("/bars");
  expect(await screen.findByRole("heading", { name: "Members of Patio" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Create invite link" })).not.toBeInTheDocument();
});

it("creates a new bar, handles failure, and selects it", async () => {
  const created: BarSummary = { ...second, role: "owner" };
  let bar: BarSummary | undefined;
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({ ...meFixture, bars: bar ? [...meFixture.bars, bar] : meFixture.bars }),
    ),
    http.post("/api/bars", () => failure("INTERNAL", 500, "Could not create"), { once: true }),
    http.post("/api/bars", async ({ request }) => {
      expect(await request.json()).toEqual({ name: second.name, currency: "JPY", seed_data: true });
      bar = created;
      return HttpResponse.json(created, { status: 201 });
    }),
    http.get(`/api/bars/${second.id}/cocktails`, () => page([])),
  );
  const { user } = renderWithProviders("/bars");
  await user.type(await screen.findByLabelText("Bar name"), second.name);
  await user.click(screen.getByLabelText("Add starter recipes and catalogue"));
  const create = screen.getByRole("button", { name: "Create bar" });
  await user.click(create);
  expect(await screen.findByText("Could not create")).toBeVisible();
  await user.click(create);
  // Switching bars remounts the page under the new bar, so wait for the settled screen.
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Cocktails" })).toBeVisible();
    expect(screen.getByTestId("bar-name")).toHaveTextContent("Patio");
  });
});

it("shows bar members and lets owners issue and revoke an invitation", async () => {
  let list: PendingInvitation[] = [];
  server.use(
    http.get(members, () => failure("INTERNAL", 500, "Members unavailable"), { once: true }),
    http.get(members, () =>
      HttpResponse.json({ members: [{ id: pending.id, display_name: "Alex", role: "viewer" }] }),
    ),
    http.get(invitations, () => failure("INTERNAL", 500, "Invitations unavailable"), {
      once: true,
    }),
    http.get(invitations, () => HttpResponse.json({ invitations: list })),
    http.post(invitations, async ({ request }) => {
      expect(await request.json()).toEqual({ role: "editor" });
      list = [pending];
      return HttpResponse.json({ ...pending, url: inviteUrl }, { status: 201 });
    }),
    http.delete(
      `${invitations}/${pending.id}`,
      () => failure("INTERNAL", 500, "Could not revoke"),
      { once: true },
    ),
    http.delete(`${invitations}/${pending.id}`, () => {
      list = [];
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/bars");
  for (const message of ["Members unavailable", "Invitations unavailable"]) {
    const error = await screen.findByText(message);
    const alert = error.closest('[role="alert"]') as HTMLElement;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
  }
  expect(await screen.findByText("Alex")).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Invitation role"), "editor");
  await user.click(screen.getByRole("button", { name: "Create invite link" }));
  const link = await screen.findByLabelText("Invitation link");
  expect(link).toHaveValue(inviteUrl);
  await user.click(link);
  expect((link as HTMLInputElement).selectionEnd).toBe(inviteUrl.length);
  const revoke = await screen.findByRole("button", { name: "Revoke" });
  await user.click(revoke);
  expect(await screen.findByText("Could not revoke")).toBeVisible();
  await user.click(revoke);
  await waitFor(() => expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
});

it("shows a clear error for an invalid or unavailable invitation", async () => {
  const invalid = renderWithProviders("/invite#bad");
  expect(await screen.findByText("This invitation link is invalid.")).toBeVisible();
  invalid.unmount();
  server.use(
    http.post("/api/invitations/preview", () => failure("NOT_FOUND", 404, "Invitation not found"), {
      once: true,
    }),
    http.post("/api/invitations/preview", () => HttpResponse.json(preview)),
  );
  const { user } = renderWithProviders(`/invite#${token}`);
  expect(await screen.findByText("Invitation not found")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Join Patio" })).toBeVisible();
});

it("signs in from an invite link, accepts, and opens the invited bar", async () => {
  let signedIn = false;
  let joined = false;
  server.use(
    http.get("/api/me", () =>
      signedIn
        ? HttpResponse.json({
            ...meFixture,
            bars: joined ? [...meFixture.bars, second] : meFixture.bars,
          })
        : guest(),
    ),
    http.post("/api/auth/sign-in", () => {
      signedIn = true;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("/api/invitations/preview", () => HttpResponse.json(preview)),
    http.post("/api/invitations/accept", () => failure("INTERNAL", 500, "Could not join"), {
      once: true,
    }),
    http.post("/api/invitations/accept", async ({ request }) => {
      expect(await request.json()).toEqual({ token });
      joined = true;
      return HttpResponse.json(second);
    }),
    http.get(`/api/bars/${second.id}/cocktails`, () => page([])),
  );
  const { user } = renderWithProviders(`/invite#${token}`);
  await user.click(await screen.findByRole("button", { name: "I already have an account" }));
  await user.click(screen.getByRole("button", { name: "Create an account instead" }));
  expect(screen.getByLabelText("Display name")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "I already have an account" }));
  await user.type(screen.getByLabelText("Email"), meFixture.user.email);
  await user.type(screen.getByLabelText("Password"), "correct password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  const join = await screen.findByRole("button", { name: "Accept invitation" });
  await user.click(join);
  expect(await screen.findByText("Could not join")).toBeVisible();
  await user.click(join);
  expect(await screen.findByRole("heading", { name: "Cocktails" })).toBeVisible();
  expect(screen.getByTestId("bar-name")).toHaveTextContent("Patio");
});

it("registers from an editor invite, then lands in the new account's bar", async () => {
  let signedIn = false;
  const editor = { ...second, role: "editor" as const };
  server.use(
    http.get("/api/me", () =>
      signedIn
        ? HttpResponse.json({ user: { ...meFixture.user, display_name: "Alex" }, bars: [editor] })
        : guest(),
    ),
    http.post("/api/invitations/preview", () => HttpResponse.json({ ...preview, role: "editor" })),
    http.post("/api/invitations/register", () => failure("CONFLICT", 409, "Email already in use"), {
      once: true,
    }),
    http.post("/api/invitations/register", async ({ request }) => {
      expect(await request.json()).toEqual({
        token,
        email: "alex@example.test",
        display_name: "Alex",
        password: "a private new password",
      });
      signedIn = true;
      return HttpResponse.json(editor, { status: 201 });
    }),
    http.get(`/api/bars/${second.id}/cocktails`, () => page([])),
  );
  const { user } = renderWithProviders(`/invite#${token}`);
  await user.type(await screen.findByLabelText("Display name"), "Alex");
  await user.type(screen.getByLabelText("Email"), "alex@example.test");
  await user.type(screen.getByLabelText("Password"), "a private new password");
  const register = screen.getByRole("button", { name: "Create account and join" });
  await user.click(register);
  expect(await screen.findByText("Email already in use")).toBeVisible();
  await user.click(register);
  expect(await screen.findByRole("heading", { name: "Cocktails" })).toBeVisible();
  expect(screen.getByTestId("bar-name")).toHaveTextContent("Patio");
});

it("requires a bar owner to type the selected bar's exact name before deletion", async () => {
  let deleted = false;
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({ ...meFixture, bars: deleted ? [] : meFixture.bars }),
    ),
    http.delete(`/api/bars/${BAR_ID}`, async ({ request }) => {
      expect(await request.json()).toEqual({ name: "Home bar" });
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/bars");
  const deletion = await screen.findByRole("region", { name: "Delete bar" });
  await user.click(within(deletion).getByRole("button", { name: "Delete Home bar" }));
  const dialog = within(await screen.findByRole("alertdialog"));
  const name = dialog.getByRole("textbox", { name: /to confirm/ });
  const confirm = dialog.getByRole("button", { name: "Delete bar" });
  expect(confirm).toBeDisabled();
  await user.type(name, "home bar");
  expect(confirm).toBeDisabled();
  expect(deleted).toBe(false);
  await user.clear(name);
  await user.type(name, "Home bar");
  await user.click(confirm);
  await waitFor(() => expect(screen.getByTestId("bar-name")).toHaveTextContent("No bar"));
});

it("can revoke a previously issued link and surfaces an issue creating a new one", async () => {
  let list = [pending];
  server.use(
    http.get(invitations, () => HttpResponse.json({ invitations: list })),
    http.post(invitations, () => failure("INTERNAL", 500, "Could not create invite")),
    http.delete(`${invitations}/${pending.id}`, () => {
      list = [];
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/bars");
  await user.click(await screen.findByRole("button", { name: "Create invite link" }));
  expect(await screen.findByText("Could not create invite")).toBeVisible();
  await user.click(await screen.findByRole("button", { name: "Revoke" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument(),
  );
});

it("shows sign-in for a guest invitation with account creation closed", async () => {
  server.use(
    http.get("/api/me", guest),
    http.post("/api/invitations/preview", () =>
      HttpResponse.json({ ...preview, can_register: false }),
    ),
  );
  renderWithProviders(`/invite#${token}`);
  expect(await screen.findByRole("heading", { name: "Join Patio" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Create account and join" })).not.toBeInTheDocument();
});

it("renames an owned bar from its row and refreshes the active bar label", async () => {
  let name = "Home bar";
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        ...meFixture,
        bars: [{ id: BAR_ID, name, currency: "JPY", role: "owner" }, second],
      }),
    ),
    http.patch(`/api/bars/${BAR_ID}`, () => failure("INTERNAL", 500, "Rename failed"), {
      once: true,
    }),
    http.patch(`/api/bars/${BAR_ID}`, async ({ request }) => {
      expect(await request.json()).toEqual({ name: "Rooftop" });
      name = "Rooftop";
      return HttpResponse.json({ id: BAR_ID, name, currency: "JPY", role: "owner" });
    }),
  );
  const { user } = renderWithProviders("/bars");
  await user.click(await screen.findByRole("button", { name: "Rename Home bar" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Rename bar" }));
  const input = dialog.getByRole("textbox", { name: "Bar name" });
  expect(input).toHaveValue("Home bar");
  expect(screen.queryByRole("button", { name: "Rename Patio" })).not.toBeInTheDocument();
  await user.clear(input);
  await user.type(input, " Rooftop ");
  const save = dialog.getByRole("button", { name: "Save name" });
  await user.click(save);
  expect(await dialog.findByText("Rename failed")).toBeVisible();
  await user.click(save);
  expect(await screen.findByRole("button", { name: "Rename Rooftop" })).toBeVisible();
  expect(screen.getByTestId("bar-name")).toHaveTextContent("Rooftop");
});

it("creates a bar in the chosen currency", async () => {
  let body: unknown;
  server.use(
    http.post("/api/bars", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ...second, currency: "EUR", role: "owner" }, { status: 201 });
    }),
    http.get(`/api/bars/${second.id}/cocktails`, () => page([])),
  );
  const { user } = renderWithProviders("/bars");
  await user.type(await screen.findByLabelText("Bar name"), second.name);
  const picker = screen.getByRole("combobox", { name: "Currency" });
  expect(picker).toHaveTextContent(/JPY — Japanese yen/i);
  await choose(user, "Currency", /EUR — Euro/i);
  await user.click(screen.getByRole("button", { name: "Create bar" }));
  await waitFor(() => expect(body).toEqual({ name: "Patio", currency: "EUR", seed_data: false }));
});

it("lets the owner change the bar currency from a searchable list", async () => {
  let currency = "JPY";
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        ...meFixture,
        bars: [{ id: BAR_ID, name: "Home bar", currency, role: "owner" }, second],
      }),
    ),
    http.patch(`/api/bars/${BAR_ID}`, () => failure("INTERNAL", 500, "Currency failed"), {
      once: true,
    }),
    http.patch(`/api/bars/${BAR_ID}`, async ({ request }) => {
      const body = (await request.json()) as { currency: string };
      expect(Object.keys(body)).toEqual(["currency"]);
      currency = body.currency;
      return HttpResponse.json({ id: BAR_ID, name: "Home bar", currency, role: "owner" });
    }),
  );
  const { user } = renderWithProviders("/bars");
  const row = within(await screen.findByRole("list", { name: "Your bars" }));
  expect(row.getAllByText(/Currency: JPY — Japanese yen/i)).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Change currency of Patio" })).toBeNull();
  await user.click(await screen.findByRole("button", { name: "Change currency of Home bar" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Bar currency" }));
  const picker = dialog.getByRole("combobox", { name: "Bar currency" });
  expect(picker).toHaveTextContent(/JPY — Japanese yen/i);
  await user.click(picker);
  await user.type(screen.getByLabelText("Search currencies"), "kuwait");
  await user.click(screen.getByRole("option", { name: /KWD — Kuwaiti Dinar/i }));
  const save = dialog.getByRole("button", { name: "Save currency" });
  await user.click(save);
  expect(await dialog.findByText("Currency failed")).toBeVisible();
  await user.click(save);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText(/Currency: KWD — Kuwaiti dinar/i)).toBeVisible();
});

it("shows the currency read-only to editors and viewers", async () => {
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({
        ...meFixture,
        bars: [{ id: BAR_ID, name: "Home bar", currency: "USD", role: "editor" }, second],
      }),
    ),
  );
  renderWithProviders("/bars");
  expect(await screen.findByText(/Currency: USD — US dollar/i)).toBeVisible();
  expect(screen.getByText(/Currency: JPY — Japanese yen/i)).toBeVisible();
  expect(screen.queryByRole("button", { name: /Change currency/ })).not.toBeInTheDocument();
});
