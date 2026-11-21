import type { RenderHookResult } from "@testing-library/react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStoredState } from "./stored-state.ts";

const VIEWS = ["grid", "list"] as const;
type View = (typeof VIEWS)[number];

const render = (): RenderHookResult<readonly [View, (next: View) => void], unknown> =>
  renderHook(() => useStoredState("larder.test", VIEWS, "grid"));

describe("useStoredState", () => {
  it("restores a stored choice and remembers a new one", () => {
    localStorage.setItem("larder.test", "list");
    const { result } = render();
    expect(result.current[0]).toBe("list");
    act(() => result.current[1]("grid"));
    expect(result.current[0]).toBe("grid");
    expect(localStorage.getItem("larder.test")).toBe("grid");
  });

  it("ignores an unknown stored value", () => {
    localStorage.setItem("larder.test", "table");
    expect(render().result.current[0]).toBe("grid");
  });

  it("still works when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = render();
    expect(result.current[0]).toBe("grid");
    act(() => result.current[1]("list"));
    expect(result.current[0]).toBe("list");
  });
});
