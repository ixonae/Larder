import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Combobox, type ComboboxOption } from "./combobox.tsx";

const tree: ComboboxOption[] = [
  { value: "spirit", label: "Spirit" },
  { value: "whisky", label: "Whisky", depth: 1, context: "Spirit" },
  { value: "scotch", label: "Scotch", depth: 2, context: "Spirit › Whisky" },
  { value: "rye", label: "Rye", depth: 2, context: "Spirit › Whisky" },
  { value: "gin", label: "Gin", depth: 1, context: "Spirit" },
  { value: "rum", label: "Rum", depth: 1, context: "Spirit" },
  { value: "creme", label: "Crème de cacao", group: "Liqueurs" },
  { value: "curacao", label: "Curaçao", group: "Liqueurs" },
];

function Harness({
  initial = "",
  options = tree,
}: {
  initial?: string;
  options?: ComboboxOption[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <Combobox
      aria-label="Category"
      value={value}
      onChange={setValue}
      options={options}
      placeholder="Choose…"
      clearLabel="Any category"
      searchPlaceholder="Search categories"
    />
  );
}

describe("Combobox", () => {
  it("browses a tree, searches full paths ignoring accents, and shows the chosen path", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Category" });
    expect(trigger).toHaveTextContent("Any category");
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "Scotch" })).toBeInTheDocument();
    expect(screen.getByText("Liqueurs")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search categories"), "whisky");
    // Children match through their path, and results say where they sit.
    expect(screen.getByRole("option", { name: "Spirit › Whisky › Scotch" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Gin/ })).toBeNull();
    await user.clear(screen.getByLabelText("Search categories"));
    await user.type(screen.getByLabelText("Search categories"), "creme");
    expect(screen.getByRole("option", { name: "Crème de cacao" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search categories"), "zzz");
    expect(screen.getByText("No matches")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search categories"));
    await user.click(screen.getByRole("option", { name: "Rye" }));
    expect(trigger).toHaveTextContent("Spirit › Whisky › Rye");

    // Reopening starts with an empty search.
    await user.click(trigger);
    expect(screen.getByLabelText("Search categories")).toHaveValue("");
    await user.click(screen.getByRole("option", { name: "Any category" }));
    expect(trigger).toHaveTextContent("Any category");
  });

  it("falls back to the placeholder for an unknown value and skips search for short lists", async () => {
    const user = userEvent.setup();
    render(<Harness initial="gone" options={tree.slice(0, 2)} />);
    const trigger = screen.getByRole("combobox", { name: "Category" });
    expect(trigger).toHaveTextContent("Choose…");
    await user.click(trigger);
    expect(screen.queryByLabelText("Search categories")).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).toBeNull();
  });
});
