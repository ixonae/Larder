import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { choose } from "@/test/render.tsx";
import { type Amount, AmountInput } from "./amount-input.tsx";

function Harness({ initial }: { initial: Amount }): JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <>
      <AmountInput value={value} onChange={setValue} />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}

const pickUnit = (name: string): Promise<void> => choose(userEvent, "Unit", name);

const shown = (): Amount => JSON.parse(screen.getByRole("status").textContent ?? "") as Amount;

describe("AmountInput", () => {
  it("edits the amount and the unit", async () => {
    render(<Harness initial={{ amount: null, unit: "ml" }} />);
    await userEvent.type(screen.getByLabelText("Amount"), "22.5");
    await pickUnit("dashes");
    expect(shown()).toEqual({ amount: 22.5, unit: "dash" });
    await userEvent.clear(screen.getByLabelText("Amount"));
    expect(shown()).toEqual({ amount: null, unit: "dash" });
  });

  it("clears and disables the amount for units without one", async () => {
    render(<Harness initial={{ amount: 2, unit: "oz" }} />);
    await pickUnit("Top");
    expect(screen.getByLabelText("Amount")).toBeDisabled();
    expect(shown()).toEqual({ amount: null, unit: "top" });
    await pickUnit("cl");
    expect(screen.getByLabelText("Amount")).toBeEnabled();
    expect(shown()).toEqual({ amount: null, unit: "cl" });
  });
});
