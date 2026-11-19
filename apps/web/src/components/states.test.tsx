import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./states.tsx";

describe("LoadingState", () => {
  it("announces loading", () => {
    const { rerender } = render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    rerender(<LoadingState label="Loading categories…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading categories…");
  });
});
