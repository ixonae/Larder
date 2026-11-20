import type { Me } from "@larder/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { page } from "./fixtures.ts";

export const BAR_ID = "01a1f326-d941-7d74-8a40-504a488cd389";

export const meFixture: Me = {
  user: {
    id: "01a1f326-d941-7d74-8a40-504a488cd388",
    email: "owner@larder.local",
    display_name: "Owner",
    is_admin: true,
  },
  bars: [{ id: BAR_ID, name: "Home bar", currency: "JPY", role: "owner" }],
};

export const handlers = [
  http.get("/api/auth/signup-settings", () => HttpResponse.json({ signup_mode: "invite_only" })),
  http.get("/api/me", () => HttpResponse.json(meFixture)),
  http.get("/api/bars/:barId/members", () => HttpResponse.json({ members: [] })),
  http.get("/api/bars/:barId/invitations", () => HttpResponse.json({ invitations: [] })),
  http.get("/api/bars/:barId/cocktails", () => page([])),
  http.get("/api/bars/:barId/cocktails/:id/comments", () => page([])),
  http.get("/api/bars/:barId/tags", () => page([])),
  http.get("/api/bars/:barId/categories/tree", () => HttpResponse.json({ items: [] })),
  http.get("/api/bars/:barId/pantry-ingredients", () => page([])),
  http.get("/api/bars/:barId/utensils", () => page([])),
  http.get("/api/bars/:barId/tastings", () => page([])),
  http.get("/api/bars/:barId/products/:id/tastings", () => page([])),
];

export const server = setupServer(...handlers);
