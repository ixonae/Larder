import { expect, it, vi } from "vitest";
import { onClosed } from "./dialog.ts";

it("closes only when the dialog asks to close", () => {
  const close: () => void = vi.fn();
  const handler: (open: boolean) => void = onClosed(close);

  handler(true);
  expect(close).not.toHaveBeenCalled();

  handler(false);
  expect(close).toHaveBeenCalledOnce();
});
