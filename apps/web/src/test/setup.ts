import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./msw.ts";

/** jsdom has no matchMedia; tests can override `matches` per case. */
export const mediaQuery = {
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
Object.defineProperty(window, "matchMedia", { value: () => mediaQuery, writable: true });
// The router restores scroll on navigation; jsdom does not implement it.
window.scrollTo = () => {};

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  document.documentElement.className = "";
  mediaQuery.matches = false;
  vi.restoreAllMocks();
});
afterAll(() => server.close());
