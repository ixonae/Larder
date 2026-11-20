import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { failure } from "@/test/fixtures.ts";
import { meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

it("validates and saves a new email with the current password", async () => {
  let email = meFixture.user.email;
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json({ ...meFixture, user: { ...meFixture.user, email } }),
    ),
    http.patch("/api/me/email", () => failure("VALIDATION", 400, "Current password is incorrect"), {
      once: true,
    }),
    http.patch("/api/me/email", async ({ request }) => {
      const data = await request.json();
      expect(data).toEqual({ email: "new@example.com", current_password: "correct password" });
      email = "new@example.com";
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/settings");
  const input = await screen.findByLabelText("Email");
  expect(input).toHaveValue(meFixture.user.email);
  const [current] = screen.getAllByLabelText("Current password") as HTMLInputElement[];
  const save = screen.getByRole("button", { name: "Save email" });
  await user.clear(input);
  await user.type(input, "invalid");
  await user.type(current as HTMLInputElement, "wrong");
  await user.click(save);
  expect(await screen.findByText(/Invalid email/)).toBeVisible();
  await user.clear(input);
  await user.type(input, "NEW@example.com");
  await user.click(save);
  expect(await screen.findByText("Current password is incorrect")).toBeVisible();
  await user.clear(current as HTMLInputElement);
  await user.type(current as HTMLInputElement, "correct password");
  await user.click(save);
  expect(await screen.findByText("Email updated.")).toBeVisible();
  expect(input).toHaveValue("new@example.com");
  expect(current).toHaveValue("");
});

it("requires a matching confirmation and clears passwords after saving", async () => {
  server.use(
    http.patch("/api/me/password", () => failure("VALIDATION", 400, "Could not change password"), {
      once: true,
    }),
    http.patch("/api/me/password", async ({ request }) => {
      expect(await request.json()).toEqual({
        current_password: "old password",
        new_password: "a long new password",
        confirm_password: "a long new password",
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderWithProviders("/settings");
  const input = await screen.findByLabelText("New password", { exact: true });
  const confirm = screen.getByLabelText("Confirm new password");
  const current = screen.getAllByLabelText("Current password")[1] as HTMLInputElement;
  const save = screen.getByRole("button", { name: "Save password" });
  await user.type(current, "old password");
  await user.type(input, "a long new password");
  await user.type(confirm, "different");
  await user.click(save);
  expect(await screen.findByText("Passwords must match.")).toBeVisible();
  await user.clear(confirm);
  await user.type(confirm, "a long new password");
  await user.click(save);
  expect(await screen.findByText("Could not change password")).toBeVisible();
  await user.click(save);
  expect(
    await screen.findByText("Password updated. Other sessions were signed out."),
  ).toBeVisible();
  await waitFor(() => expect(input).toHaveValue(""));
  expect(current).toHaveValue("");
});
