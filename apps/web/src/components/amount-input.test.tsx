import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { type Amount, AmountInput } from "./amount-input.tsx";

function Harness({ initial }: { initial: Amount }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <AmountInput value={value} onChange={setValue} />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}

const shown = () => JSON.parse(screen.getByRole("status").textContent ?? "") as Amount;

describe("AmountInput", () => {
  it("edits the amount and the unit", async () => {
    render(<Harness initial={{ amount: null, unit: "ml" }} />);
    await userEvent.type(screen.getByLabelText("Amount"), "22.5");
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "dashes");
    expect(shown()).toEqual({ amount: 22.5, unit: "dash" });
    await userEvent.clear(screen.getByLabelText("Amount"));
    expect(shown()).toEqual({ amount: null, unit: "dash" });
  });

  it("clears and disables the amount for units without one", async () => {
    render(<Harness initial={{ amount: 2, unit: "oz" }} />);
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "Top");
    expect(screen.getByLabelText("Amount")).toBeDisabled();
    expect(shown()).toEqual({ amount: null, unit: "top" });
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "cl");
    expect(screen.getByLabelText("Amount")).toBeEnabled();
    expect(shown()).toEqual({ amount: null, unit: "cl" });
  });
});
