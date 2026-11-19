import type { Me } from "@larder/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

export const BAR_ID = "01a1f326-d941-7d74-8a40-504a488cd389";

export const meFixture: Me = {
  user: {
    id: "01a1f326-d941-7d74-8a40-504a488cd388",
    email: "owner@larder.local",
    display_name: "Owner",
  },
  bars: [{ id: BAR_ID, name: "Home bar", role: "owner" }],
};

export const handlers = [
  http.get("/api/me", () => HttpResponse.json(meFixture)),
  http.get(`/api/bars/${BAR_ID}/categories/tree`, () => HttpResponse.json({ items: [] })),
  http.get(`/api/bars/${BAR_ID}/pantry-ingredients`, () =>
    HttpResponse.json({ items: [], next_cursor: null }),
  ),
  http.get(`/api/bars/${BAR_ID}/utensils`, () =>
    HttpResponse.json({ items: [], next_cursor: null }),
  ),
];

export const server = setupServer(...handlers);
