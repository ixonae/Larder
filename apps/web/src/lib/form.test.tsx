import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@/api/client.ts";
import { Input } from "@/components/ui/input.tsx";
import type { ControlProps } from "@/lib/form.tsx";
import { applyServerErrors, emptyToNullNumber, FormField, useZodForm } from "./form.tsx";

const schema = z.object({ name: z.string().trim().min(1, "Name is required") });

function TestForm({
  onValid,
  serverError,
  hint = "As on the label",
}: {
  onValid: (v: unknown) => void;
  serverError?: unknown;
  /** Empty for a field without a hint. */
  hint?: string;
}): JSX.Element {
  const form = useZodForm(schema, { defaultValues: { name: "" } });
  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        onValid(values);
        if (serverError) applyServerErrors(form, serverError);
      })}
    >
      <FormField form={form} name="name" label="Name" hint={hint}>
        {(control: ControlProps): JSX.Element => <Input {...control} {...form.register("name")} />}
      </FormField>
      <button type="submit">Save</button>
    </form>
  );
}

describe("useZodForm and FormField", () => {
  it("shows the schema's error on the field and blocks submit", async () => {
    const onValid = vi.fn();
    render(<TestForm onValid={onValid} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("As on the label Name is required");
    expect(onValid).not.toHaveBeenCalled();
  });

  it("submits the parsed values", async () => {
    const onValid = vi.fn();
    render(<TestForm onValid={onValid} />);
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "false");
    await userEvent.type(screen.getByLabelText("Name"), "  Gin ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onValid).toHaveBeenCalledWith({ name: "Gin" });
  });

  it("leaves the control undescribed without a hint or an error", () => {
    render(<TestForm onValid={(): void => {}} hint="" />);
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-describedby");
  });

  it("puts API validation issues on the matching field", async () => {
    const error = new ApiError(400, "VALIDATION", "Invalid json", [
      { path: ["name"], message: "Too fancy" },
    ]);
    render(<TestForm onValid={(): void => {}} serverError={error} />);
    await userEvent.type(screen.getByLabelText("Name"), "Gin");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Too fancy")).toBeInTheDocument();
  });
});

describe("applyServerErrors", () => {
  const form = (): Parameters<typeof applyServerErrors>[0] => ({ setError: vi.fn() });

  it.each([
    ["a plain error", new Error("x")],
    ["another code", new ApiError(409, "CONFLICT", "x")],
    ["details that are not issues", new ApiError(400, "VALIDATION", "x", { nope: true })],
    ["issues with bad entries", new ApiError(400, "VALIDATION", "x", [null])],
    ["issues without a path", new ApiError(400, "VALIDATION", "x", [{ path: [], message: "m" }])],
  ])("returns false for %s", (_, error) => {
    const f = form();
    expect(applyServerErrors(f, error)).toBe(false);
  });

  it("joins nested paths", () => {
    const f = form();
    const error = new ApiError(400, "VALIDATION", "x", [
      { path: ["lines", 0, "amount"], message: "m" },
    ]);
    expect(applyServerErrors(f, error)).toBe(true);
    expect(f.setError).toHaveBeenCalledWith("lines.0.amount", { type: "server", message: "m" });
  });
});

describe("setValueAs coercers", () => {
  it("turn the empty value into undefined or null and keep the rest", () => {
    expect(emptyToNullNumber("")).toBeNull();
    expect(emptyToNullNumber(null)).toBeNull();
    expect(emptyToNullNumber("40.5")).toBe(40.5);
  });
});
