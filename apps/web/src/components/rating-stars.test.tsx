import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { RatingStars } from "./rating-stars.tsx";

function Harness(): JSX.Element {
  const [value, setValue] = useState<number | null>(null);
  return (
    <>
      <RatingStars value={value} onChange={setValue} label="Your rating" />
      <output>{String(value)}</output>
    </>
  );
}

describe("RatingStars", () => {
  it("displays a read-only rating", () => {
    const { rerender } = render(<RatingStars value={4} />);
    expect(screen.getByRole("img", { name: "4 out of 5 stars" })).toBeInTheDocument();
    rerender(<RatingStars value={null} />);
    expect(screen.getByRole("img", { name: "Not rated" })).toBeInTheDocument();
  });

  it("layers the community average under your rating", () => {
    const noop = (): void => {};
    const { container, rerender } = render(
      <RatingStars value={2} average={3.5} onChange={noop} label="Your rating" />,
    );
    const fills: string[] = Array.from(
      container.querySelectorAll<HTMLElement>("label span[style]"),
    ).map((el: HTMLElement): string => el.style.width);
    expect(fills).toEqual(["100%", "100%", "100%", "50%", "0%"]);
    expect(container.querySelectorAll("svg.text-brand")).toHaveLength(2);
    rerender(<RatingStars value={null} average={null} onChange={noop} label="Your rating" />);
    expect(container.querySelectorAll("svg.text-brand")).toHaveLength(0);
    expect(
      Array.from(container.querySelectorAll<HTMLElement>("label span[style]")).every(
        (el: HTMLElement): boolean => el.style.width === "0%",
      ),
    ).toBe(true);
  });

  it("picks a score, changes it with the keyboard and clears it", async () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Your rating" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "3 stars" }));
    expect(screen.getByRole("status")).toHaveTextContent("3");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("status")).toHaveTextContent("4");
    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(screen.getByRole("status")).toHaveTextContent("null");
    await userEvent.click(screen.getByRole("radio", { name: "1 star" }));
    expect(screen.getByRole("status")).toHaveTextContent("1");
  });
});
