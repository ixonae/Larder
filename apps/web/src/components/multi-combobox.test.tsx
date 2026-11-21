import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { ComboboxOption } from "./combobox.tsx";
import { MultiCombobox } from "./multi-combobox.tsx";

const options: ComboboxOption[] = [
  { value: "gin", label: "Gin" },
  { value: "rum", label: "Rum", depth: 1, context: "Spirit" },
  { value: "rye", label: "Rye" },
  { value: "scotch", label: "Scotch" },
  { value: "tequila", label: "Tequila" },
  { value: "vodka", label: "Vodka" },
  { value: "cognac", label: "Cognac" },
  { value: "creme", label: "Crème de cacao" },
];

function Harness({ initial = [] }: { initial?: string[] }): JSX.Element {
  const [values, setValues] = useState(initial);
  return (
    <MultiCombobox
      label="Alcohol"
      values={values}
      onChange={setValues}
      options={options}
      fallbackLabel="Unavailable"
      searchPlaceholder="Search alcohol"
    />
  );
}

describe("MultiCombobox", () => {
  it("ticks and unticks several options, searching ignoring accents, and clears them", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Alcohol" });
    expect(trigger).toHaveTextContent(/^Alcohol$/);

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Gin" }));
    expect(screen.getByRole("option", { name: "Gin" })).toBeVisible();
    await user.type(screen.getByLabelText("Search alcohol"), "creme");
    expect(screen.queryByRole("option", { name: "Gin" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Crème de cacao" }));
    expect(trigger).toHaveTextContent("Alcohol: Gin+1");

    await user.click(screen.getByRole("option", { name: "Crème de cacao" }));
    expect(trigger).toHaveTextContent(/^Alcohol: Gin$/);
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(trigger).toHaveTextContent(/^Alcohol$/);
    expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
  });

  it("names chosen values that are not among the options", async () => {
    render(<Harness initial={["gone"]} />);
    expect(screen.getByRole("combobox", { name: "Alcohol" })).toHaveTextContent(
      "Alcohol: Unavailable",
    );
  });
});
