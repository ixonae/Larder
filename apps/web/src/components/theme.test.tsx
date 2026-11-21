import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mediaQuery } from "@/test/setup.ts";
import { applyTheme, readTheme, ThemeToggle } from "./theme.tsx";

const isDark = (): boolean => document.documentElement.classList.contains("dark");

describe("ThemeToggle", () => {
  it("cycles light → dark → system and remembers the choice", async () => {
    localStorage.setItem("larder.theme", "light");
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /Theme: light/ });
    expect(isDark()).toBe(false);

    await user.click(button);
    expect(button).toHaveAccessibleName("Theme: dark. Switch to system");
    expect(isDark()).toBe(true);
    expect(localStorage.getItem("larder.theme")).toBe("dark");

    await user.click(button);
    expect(button).toHaveAccessibleName("Theme: system. Switch to light");
    expect(localStorage.getItem("larder.theme")).toBeNull();

    await user.click(button);
    expect(button).toHaveAccessibleName("Theme: light. Switch to dark");
  });

  it("follows the system theme while on system", () => {
    mediaQuery.matches = true;
    const { unmount } = render(<ThemeToggle />);
    expect(isDark()).toBe(true);

    const onChange = mediaQuery.addEventListener.mock.calls[0]?.[1] as () => void;
    mediaQuery.matches = false;
    onChange();
    expect(isDark()).toBe(false);

    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", onChange);
  });

  it("still works when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readTheme()).toBe("system");
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button"));
    expect(isDark()).toBe(false);
    expect(screen.getByRole("button")).toHaveAccessibleName(/Theme: light/);
  });
});

describe("applyTheme", () => {
  it("applies an explicit theme regardless of the system", () => {
    mediaQuery.matches = true;
    applyTheme("light");
    expect(isDark()).toBe(false);
    applyTheme("dark");
    expect(isDark()).toBe(true);
  });
});
