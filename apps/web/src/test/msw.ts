import type { Me } from "@larder/shared";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

export const meFixture: Me = {
  user: {
    id: "01a1f326-d941-7d74-8a40-504a488cd388",
    email: "owner@larder.local",
    display_name: "Owner",
  },
  bars: [{ id: "01a1f326-d941-7d74-8a40-504a488cd389", name: "Home bar", role: "owner" }],
};

export const handlers = [http.get("/api/me", () => HttpResponse.json(meFixture))];

export const server = setupServer(...handlers);
