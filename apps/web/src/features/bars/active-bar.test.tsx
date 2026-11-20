import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useSignedIn } from "./active-bar.tsx";

it("refuses to read the signed-in user outside the signed-in shell", () => {
  // React logs the error thrown during render; keep the test output clean.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(() => renderHook(() => useSignedIn())).toThrow(
    "only available inside the signed-in shell",
  );
});
